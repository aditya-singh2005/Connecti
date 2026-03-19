import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import NativeGeofenceService from './NativeGeofenceService';

const WAVE_TIMER_KEY = 'wave_timer_expiry';
const SUPPRESSIONS_KEY = 'user_zone_suppressions'; // Local cache of DB suppressions
// PRODUCTION: 30 min for the post-wave timer.
const WAVE_DURATION_MS = 30 * 60 * 1000;

let resetTimeout = null;

/** Returns the ISO timestamp for the end of today (23:59:59.999) */
function getEndOfTodayISO() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
}

export class WaveService {
    /**
     * Aggressively syncs the user's active zone presence to Supabase.
     * Can be called from foreground or background.
     * DB write only happens on ENTER (called once per zone entry).
     */
    static async syncUserZone(userId, zoneName, location = null, openToWaveOverride = undefined, executionState = 'background') {
        try {
            console.log(`[Sync] 🌐 Syncing zone ${zoneName} for user ${userId}`);

            const fcmToken = await AsyncStorage.getItem('fcm_device_token');
            const expoToken = await AsyncStorage.getItem('expo_push_token');
            const timerDataJson = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            const timerData = timerDataJson ? JSON.parse(timerDataJson) : null;
            const isLocalWaved = timerData && (timerData.expiryTime > Date.now());

            let zoneId = null;
            let finalZoneName = zoneName;

            if (!finalZoneName || finalZoneName === 'Unknown Zone') {
                finalZoneName = await AsyncStorage.getItem('current_zone');
            }

            if (finalZoneName && finalZoneName !== 'Unknown Zone') {
                const { data: zone } = await supabase
                    .from('geofence_zones')
                    .select('id, name')
                    .eq('name', finalZoneName)
                    .limit(1)
                    .maybeSingle();

                if (zone) {
                    zoneId = zone.id;
                    finalZoneName = zone.name;
                }
            }

            // Determine if we should be open to wave. 
            // 1. Explicit override (manual wave)
            // 2. Local valid timer (zone hopping)
            // 3. Fallback to DB check
            let openToWaveStatus = false;
            if (openToWaveOverride !== undefined) {
                openToWaveStatus = openToWaveOverride;
            } else if (isLocalWaved) {
                openToWaveStatus = true;
            } else {
                // If it's a fresh sync (no local timer and no override), default to FALSE.
                // We no longer fallback to a DB check that might return true from a stale record.
                console.log(`[Sync] 🆕 Initial entry sync for ${zoneName}. Defaulting to open_to_wave = false`);
                openToWaveStatus = false;
            }

            if (zoneId) {
                // If it's a zone hop (already waved but new zone), refresh timer
                if (openToWaveStatus && timerData && timerData.zoneName !== finalZoneName) {
                    console.log(`[Sync] ♻️ Zone hopping from ${timerData.zoneName} to ${finalZoneName}. Refreshing timer.`);
                    const newExpiry = Date.now() + WAVE_DURATION_MS;
                    await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({ userId, zoneName: finalZoneName, expiryTime: newExpiry }));
                    this.scheduleAutoReset(userId, newExpiry);
                }

                const upsertData = {
                    user_id: userId,
                    zone_id: zoneId,
                    zone_name: finalZoneName,
                    open_to_wave: openToWaveStatus,
                    fcm_token: fcmToken,
                    expo_push_token: expoToken,
                    execution_state: executionState,
                    last_updated: new Date().toISOString()
                };

                if (location) {
                    upsertData.latitude = location.latitude;
                    upsertData.longitude = location.longitude;
                }

                await supabase.from('active_zone_users').upsert(upsertData, { onConflict: 'user_id' });

                // Sync with native side
                if (Platform.OS === 'android') {
                    await NativeGeofenceService.setIsWaved(openToWaveStatus, timerData?.expiryTime || 0);
                }

                console.log(`[Sync] ✅ Presence synced in ${finalZoneName} (Open: ${openToWaveStatus})`);
                return { success: true, openToWave: openToWaveStatus };
            }

            return { success: false, openToWave: false };
        } catch (error) {
            console.error('[Sync] ❌ Failed to sync presence:', error.message);
            return { success: false, openToWave: false };
        }
    }

    /**
     * Sets open_to_wave = true for the user in the given zone.
     * Starts a 30-minute timer.
     */
    static async setOpenToWave(userId, zoneName) {
        try {
            console.log(`🌊 [WaveService] Setting open_to_wave = true for ${zoneName}`);

            // Always start a fresh timer on manual click
            const expiryTime = Date.now() + WAVE_DURATION_MS;
            await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({ userId, zoneName, expiryTime }));
            this.scheduleAutoReset(userId, expiryTime);

            await this.syncUserZone(userId, zoneName, null, true);
            return true;
        } catch (error) {
            console.error('❌ Error in setOpenToWave:', error);
            return false;
        }
    }

    /**
     * Stores a "Later" suppression for the given zone in Supabase.
     */
    static async setLaterForZone(userId, zoneId, zoneName) {
        try {
            console.log(`⏳ [WaveService] Setting 'Later' suppression for ${zoneName} (${zoneId})`);

            const expiry = getEndOfTodayISO();

            // 1. Fetch current suppressions
            const { data: userRecord } = await supabase
                .from('active_zone_users')
                .select('suppressions')
                .eq('user_id', userId)
                .maybeSingle();

            const currentSuppressions = userRecord?.suppressions || {};
            const newSuppressions = { ...currentSuppressions, [zoneId]: expiry };

            // 2. Update Supabase
            const { error } = await supabase
                .from('active_zone_users')
                .update({ suppressions: newSuppressions })
                .eq('user_id', userId);

            if (error) throw error;

            // 3. Update local cache
            await AsyncStorage.setItem(SUPPRESSIONS_KEY, JSON.stringify(newSuppressions));

            // 4. Sync to native cache for Killed state awareness
            const { NativeModules, Platform } = require('react-native');
            if (Platform.OS === 'android' && NativeModules?.NativeGeofenceModule?.updateNativeSuppressionCache) {
                await NativeModules.NativeGeofenceModule.updateNativeSuppressionCache(JSON.stringify(newSuppressions));
            }

            console.log(`✅ [WaveService] Suppression persisted to Supabase for ${zoneName}`);
            return true;
        } catch (error) {
            console.error('❌ Error in setLaterForZone:', error);
            return false;
        }
    }

    /**
     * Clears all suppressions for the user.
     */
    static async resetSuppressions(userId) {
        try {
            console.log(`[WaveService] 🔄 Resetting all suppressions for user ${userId}`);

            // 1. Clear Supabase
            const { error } = await supabase
                .from('active_zone_users')
                .update({ suppressions: {} })
                .eq('user_id', userId);

            if (error) throw error;

            // 2. Clear local cache
            await AsyncStorage.setItem(SUPPRESSIONS_KEY, JSON.stringify({}));

            // 3. Update native cache
            const { NativeModules, Platform } = require('react-native');
            if (Platform.OS === 'android' && NativeModules?.NativeGeofenceModule?.updateNativeSuppressionCache) {
                await NativeModules.NativeGeofenceModule.updateNativeSuppressionCache(JSON.stringify({}));
            }

            console.log('✅ [WaveService] All suppressions cleared');
            return true;
        } catch (error) {
            console.error('❌ Error in resetSuppressions:', error);
            return false;
        }
    }

    /**
     * Returns true if the given zone is suppressed.
     */
    static async isLaterSuppressed(zoneId) {
        try {
            const data = await AsyncStorage.getItem(SUPPRESSIONS_KEY);
            if (!data) return false;

            const suppressions = JSON.parse(data);
            const expiry = suppressions[zoneId];
            if (!expiry) return false;

            return new Date(expiry) > new Date();
        } catch {
            return false;
        }
    }

    /**
     * Syncs suppressions from Supabase on app start.
     */
    static async syncSuppressions(userId) {
        try {
            const { data, error } = await supabase
                .from('active_zone_users')
                .select('suppressions')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) throw error;

            const suppressions = data?.suppressions || {};
            await AsyncStorage.setItem(SUPPRESSIONS_KEY, JSON.stringify(suppressions));

            const { NativeModules, Platform } = require('react-native');
            if (Platform.OS === 'android' && NativeModules?.NativeGeofenceModule?.updateNativeSuppressionCache) {
                await NativeModules.NativeGeofenceModule.updateNativeSuppressionCache(JSON.stringify(suppressions));
            }
            console.log('[WaveService] 🔄 Suppressions synced from Supabase');
        } catch (error) {
            console.warn('[WaveService] ⚠️ Suppression sync failed:', error.message);
        }
    }

    static scheduleAutoReset(userId, expiryTime) {
        if (resetTimeout) clearTimeout(resetTimeout);

        const delay = expiryTime - Date.now();
        if (delay > 0) {
            console.log(`⏰ [WaveService] Auto-reset scheduled in ${Math.round(delay / 60000)} min`);
            resetTimeout = setTimeout(async () => {
                await this.resetOpenToWave(userId);
            }, delay);
        }
    }

    /**
     * Called when the 30-min timer fires:
     * - If still in same zone → keep open_to_wave = true (no change)
     * - If in a different zone → update zone_name but keep open_to_wave = true
     * - If in no zone → set open_to_wave = false and delete record
     */
    static async resetOpenToWave(userId) {
        try {
            const timerDataJson = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            const wavedZone = timerDataJson ? JSON.parse(timerDataJson).zoneName : null;
            const currentZone = await AsyncStorage.getItem('current_zone');

            if (currentZone && currentZone === wavedZone) {
                // USER REQUEST: Strict 30-min timer. NO MORE AUTO-RENEWAL.
                console.log(`🗑️ [WaveService] 30 min reached for "${currentZone}". Timer expired. Clearing waved status.`);
            }

            // Clear remote record OR set open_to_wave to false in DB
            console.log(`🗑️ [WaveService] Wave expired. Clearing record for user ${userId}.`);

            // No zone -> clear remote record
            console.log(`🗑️ [WaveService] User left all zones after 30 min. Clearing record.`);
            await supabase
                .from('active_zone_users')
                .delete()
                .eq('user_id', userId);

            await AsyncStorage.removeItem(WAVE_TIMER_KEY);
            await AsyncStorage.removeItem('current_zone');

            // Sync with native side
            if (Platform.OS === 'android') {
                await NativeGeofenceService.setIsWaved(false, 0);
            }
        } catch (error) {
            console.error('❌ Error in resetOpenToWave:', error);
        }
    }

    /** Returns true if the user is locally 'Waved' (active timer) */
    static async isWavedLocal() {
        try {
            const timerDataJson = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            if (!timerDataJson) return false;
            const timerData = JSON.parse(timerDataJson);
            return timerData && (timerData.expiryTime > Date.now());
        } catch {
            return false;
        }
    }

    static async checkAndResumeTimer() {
        try {
            const timerData = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            if (!timerData) return;

            const { userId, expiryTime } = JSON.parse(timerData);
            const now = Date.now();

            if (now >= expiryTime) {
                await this.resetOpenToWave(userId);
            } else {
                this.scheduleAutoReset(userId, expiryTime);
            }
        } catch (error) {
            console.error('❌ Timer resume failed:', error.message);
        }
    }

    static async getRemainingTime() {
        try {
            const timerData = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            if (!timerData) return 0;
            const { expiryTime } = JSON.parse(timerData);
            return Math.max(0, expiryTime - Date.now());
        } catch {
            return 0;
        }
    }
}
