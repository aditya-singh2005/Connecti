import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
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
    static async syncUserZone(userId, zoneName, location = null, openToWaveOverride = undefined, executionState = 'foreground') {
        try {
            console.log(`[Sync] 🌐 Syncing zone ${zoneName} for user ${userId}`);

            const fcmTokenRaw = await AsyncStorage.getItem('fcm_device_token');
            const expoTokenRaw = await AsyncStorage.getItem('expo_push_token');
            // Tokens may be stored as JSON objects, extract the real string
            let fcmToken = null;
            let expoToken = null;
            try {
                if (fcmTokenRaw) {
                    const parsed = JSON.parse(fcmTokenRaw);
                    fcmToken = parsed?.fcmToken || (typeof parsed === 'string' ? parsed : null);
                    expoToken = parsed?.expoToken || expoToken;
                }
            } catch { fcmToken = fcmTokenRaw; }
            try {
                if (expoTokenRaw) {
                    const parsed = JSON.parse(expoTokenRaw);
                    expoToken = expoToken || (parsed?.expoToken || (typeof parsed === 'string' ? parsed : null));
                }
            } catch { expoToken = expoToken || expoTokenRaw; }
            console.log(`[Sync] 🔑 Tokens resolved — FCM: ${fcmToken ? fcmToken.substring(0, 20) + '...' : 'null'}, Expo: ${expoToken ? expoToken.substring(0, 20) + '...' : 'null'}`);
            const timerDataJson = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            const timerData = timerDataJson ? JSON.parse(timerDataJson) : null;
            const isLocalWaved = timerData && (timerData.expiryTime > Date.now());

            let finalZoneName = zoneName;
            if (!finalZoneName || finalZoneName === 'Unknown Zone') {
                finalZoneName = await AsyncStorage.getItem('current_zone');
            }
            if (!finalZoneName || finalZoneName === 'Unknown Zone') {
                console.warn('[Sync] ⚠️ No valid zone name, skipping sync');
                return { success: false, openToWave: false };
            }

            // Determine open_to_wave status
            let openToWaveStatus = false;
            if (openToWaveOverride !== undefined) {
                openToWaveStatus = openToWaveOverride;
            } else if (isLocalWaved) {
                openToWaveStatus = true;
            } else {
                console.log(`[Sync] 🆕 No active wave timer for ${finalZoneName}. Defaulting open_to_wave = false`);
            }

            // Zone hop: refresh timer if moved to a new zone while waving
            if (openToWaveStatus && timerData && timerData.zoneName !== finalZoneName) {
                console.log(`[Sync] ♻️ Zone hopping from ${timerData.zoneName} to ${finalZoneName}. Refreshing timer.`);
                const newExpiry = Date.now() + WAVE_DURATION_MS;
                await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({ userId, zoneName: finalZoneName, expiryTime: newExpiry }));
                this.scheduleAutoReset(userId, newExpiry);
            }

            // Use RPC to avoid PostgREST uuid/text type casting issues
            const { data: rpcResult, error: rpcError } = await supabase.rpc('sync_user_zone_presence', {
                p_user_id: userId,
                p_zone_name: finalZoneName,
                p_open_to_wave: openToWaveStatus,
                p_fcm_token: fcmToken || null,
                p_expo_push_token: expoToken || null,
                p_execution_state: executionState,
            });

            if (rpcError) {
                console.error(`[Sync] ❌ RPC sync failed: ${rpcError.message}`);
                return { success: false, openToWave: false };
            }

            if (!rpcResult?.success) {
                console.warn(`[Sync] ⚠️ RPC returned failure: ${rpcResult?.error}`);
                return { success: false, openToWave: false };
            }

            // Sync with native side
            if (Platform.OS === 'android') {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    await NativeGeofenceService.setSessionContext(
                        authUser.id,
                        process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://qczxsjfkjpcvjbqvcqbc.supabase.co',
                        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
                    );
                }
                await NativeGeofenceService.setIsWaved(openToWaveStatus, timerData?.expiryTime ? (timerData.expiryTime - Date.now()) : 0);
            }

            console.log(`[Sync] ✅ Presence synced in ${finalZoneName} (Open: ${openToWaveStatus})`);
            return { success: true, openToWave: openToWaveStatus };

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

            // 1. Do a direct, targeted update first — this guarantees open_to_wave=true
            //    regardless of whether the zone lookup in syncUserZone succeeds.
            const { error: directError } = await supabase
                .from('active_zone_users')
                .update({ open_to_wave: true, last_updated: new Date().toISOString() })
                .eq('user_id', userId);

            if (directError) {
                console.warn(`[WaveService] ⚠️ Direct update failed (${directError.message}), trying upsert via syncUserZone...`);
            } else {
                console.log(`[WaveService] ✅ Direct open_to_wave=true written to DB`);
            }

            // 2. Also do full sync to ensure all fields (zone_id, zone_name, etc.) are up to date
            await this.syncUserZone(userId, zoneName, null, true);

            // Notify native side immediately for killed-state persistence
            if (Platform.OS === 'android') {
                // Cancel inactivity reminders/removal for this zone
                try {
                    const {  data: zone } = await supabase.from('geofence_zones').select('id').eq('name', zoneName).maybeSingle();
                    if (zone) {
                        await NativeGeofenceService.cancelInactivityTimers(zone.id);
                    }
                } catch (_e) {}
                
                await NativeGeofenceService.setIsWaved(true, WAVE_DURATION_MS);
            }

            // 3. Trigger matching asynchronously in a COMPLETELY SEPARATE request
            // This guarantees that any matching failure cannot roll back the wave write above.
            console.log(`[WaveService] 🔍 Triggering async match finding for user...`);
            
            // RUN DIAGNOSTIC LOGGING FIRST
            supabase.rpc('debug_match_state', { p_user_id: userId })
                .then(({ data, error }) => {
                    if (error) {
                        console.error(`[WaveService:Debug] ❌ Failed to get debug state:`, error.message);
                    } else {
                        console.log(`[WaveService:Debug] 🕵️ Diagnostic State for User ${userId}: \n${JSON.stringify(data, null, 2)}`);
                    }
                })
                .catch(err => console.error(`[WaveService:Debug] ❌ Exception:`, err));

            supabase.rpc('match_active_waves_for_user', { p_user_id: userId })
                .then(({ data, error }) => {
                    if (error) {
                        console.warn(`[WaveService] ⚠️ Async match finding failed:`, error.message);
                    } else {
                        console.log(`[WaveService] ✅ Async match finding completed. Matches returned:`, JSON.stringify(data));
                    }
                })
                .catch(err => console.warn(`[WaveService] ⚠️ Async match finding error:`, err));
            
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

            console.log(`🗑️ [WaveService] Wave expired. Clearing record for user ${userId}.`);

            await supabase
                .from('active_zone_users')
                .update({ open_to_wave: false })
                .eq('user_id', userId)
                .eq('zone_name', wavedZone);

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

    static async stopWaving(userId) {
        try {
            const timerDataJson = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            const timerData = timerDataJson ? JSON.parse(timerDataJson) : null;
            const zoneName = timerData?.zoneName || await AsyncStorage.getItem('current_zone');

            let query = supabase
                .from('active_zone_users')
                .update({ open_to_wave: false })
                .eq('user_id', userId);
            if (zoneName) query = query.eq('zone_name', zoneName);
            await query;

            await AsyncStorage.removeItem(WAVE_TIMER_KEY);
            if (resetTimeout) clearTimeout(resetTimeout);
            resetTimeout = null;
            if (Platform.OS === 'android') await NativeGeofenceService.setIsWaved(false, 0);
            return true;
        } catch (error) {
            console.error('❌ Error stopping Wave:', error);
            return false;
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
