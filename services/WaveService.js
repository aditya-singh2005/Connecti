// services/WaveService.js - Manages open_to_wave state with 30-min check, Later suppression
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const WAVE_TIMER_KEY = 'wave_timer_expiry';
// PRODUCTION: Change to 60 * 60 * 1000 (60 mins). 30 min for the post-wave timer.
const WAVE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

let resetTimeout = null;

/** Returns a key like later_2026-02-22_ZoneName for day-scoped suppression. */
function getLaterKey(zoneName) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `later_${today}_${zoneName}`;
}

export class WaveService {
    /**
     * Aggressively syncs the user's active zone presence to Supabase.
     * Can be called from foreground or background.
     * DB write only happens on ENTER (called once per zone entry).
     */
    static async syncUserZone(userId, zoneName, location = null, openToWaveOverride = undefined) {
        try {
            console.log(`[Sync] 🌐 Syncing zone ${zoneName} for user ${userId}`);

            const fcmToken = await AsyncStorage.getItem('fcm_device_token');
            const expoToken = await AsyncStorage.getItem('expo_push_token');

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
                    .single();

                if (zone) {
                    zoneId = zone.id;
                    finalZoneName = zone.name;
                }
            }

            // Determine open_to_wave value
            let openToWaveStatus = openToWaveOverride;

            if (openToWaveStatus === undefined) {
                const { data: existing } = await supabase
                    .from('active_zone_users')
                    .select('open_to_wave, last_updated')
                    .eq('user_id', userId)
                    .single();

                if (existing) {
                    const lastUpdate = new Date(existing.last_updated).getTime();
                    const now = Date.now();
                    openToWaveStatus = (now - lastUpdate < WAVE_DURATION_MS) ? existing.open_to_wave : false;
                } else {
                    openToWaveStatus = false;
                }
            }

            if (zoneId) {
                const upsertData = {
                    user_id: userId,
                    zone_id: zoneId,
                    zone_name: finalZoneName,
                    open_to_wave: openToWaveStatus,
                    fcm_token: fcmToken,
                    expo_push_token: expoToken,
                    last_updated: new Date().toISOString()
                };

                if (location) {
                    upsertData.latitude = location.latitude;
                    upsertData.longitude = location.longitude;
                }

                const { error } = await supabase
                    .from('active_zone_users')
                    .upsert(upsertData, { onConflict: 'user_id' });

                if (error) throw error;

                if (openToWaveStatus) {
                    const timerDataJson = await AsyncStorage.getItem(WAVE_TIMER_KEY);
                    let expiryTime;

                    if (timerDataJson && openToWaveOverride === undefined) {
                        const timerData = JSON.parse(timerDataJson);
                        if (finalZoneName !== timerData.zoneName) {
                            console.log(`[Sync] ♻️ Zone changed to ${finalZoneName}, refreshing wave timer`);
                            expiryTime = Date.now() + WAVE_DURATION_MS;
                            this.scheduleAutoReset(userId, expiryTime);
                        } else {
                            expiryTime = timerData.expiryTime;
                        }
                    } else {
                        expiryTime = Date.now() + WAVE_DURATION_MS;
                        this.scheduleAutoReset(userId, expiryTime);
                    }

                    await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({ userId, zoneName: finalZoneName, expiryTime }));
                }

                console.log(`[Sync] ✅ Synced presence in ${finalZoneName} (Open: ${openToWaveStatus})`);
                return { success: true, openToWave: openToWaveStatus };
            } else {
                console.warn(`[Sync] ⚠️ Could not find zone_id for ${finalZoneName}, skip sync`);
                return { success: false, openToWave: false };
            }
        } catch (error) {
            console.error('[Sync] ❌ Failed to sync presence:', error.message);
            return { success: false, openToWave: false };
        }
    }

    /**
     * Sets open_to_wave = true for the user in the given zone.
     * Starts a 30-minute timer that checks zone on expiry.
     */
    static async setOpenToWave(userId, zoneName) {
        try {
            console.log(`🌊 [WaveService] Setting open_to_wave = true for ${zoneName}`);

            await this.syncUserZone(userId, zoneName, null, true);

            const expiryTime = Date.now() + WAVE_DURATION_MS;
            await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({ userId, zoneName, expiryTime }));

            console.log(`✅ open_to_wave = true until ${new Date(expiryTime).toLocaleTimeString()}`);
            this.scheduleAutoReset(userId, expiryTime);
            return true;
        } catch (error) {
            console.error('❌ Error in setOpenToWave:', error);
            return false;
        }
    }

    /**
     * Stores a "Later" suppression for the given zone for the rest of today.
     * Key format: later_YYYY-MM-DD_zoneName
     */
    static async setLaterForZone(zoneName) {
        try {
            const key = getLaterKey(zoneName);
            await AsyncStorage.setItem(key, 'true');
            console.log(`⏳ [WaveService] Later set for zone "${zoneName}" (key: ${key})`);
            return true;
        } catch (error) {
            console.error('❌ Error in setLaterForZone:', error);
            return false;
        }
    }

    /**
     * Returns true if the given zone is "Later"-suppressed for today.
     */
    static async isLaterSuppressed(zoneName) {
        try {
            const key = getLaterKey(zoneName);
            const val = await AsyncStorage.getItem(key);
            return val === 'true';
        } catch {
            return false;
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
                // Still in the same zone the user waved in → stay open
                console.log(`♻️ [WaveService] Still in same zone "${currentZone}" after 30 min, keeping open`);
                const newExpiry = Date.now() + WAVE_DURATION_MS;
                await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({ userId, zoneName: currentZone, expiryTime: newExpiry }));
                this.scheduleAutoReset(userId, newExpiry);
                return;
            }

            if (currentZone && currentZone !== wavedZone) {
                // Moved to a different zone → update zone but keep open_to_wave true
                console.log(`♻️ [WaveService] Zone changed from "${wavedZone}" to "${currentZone}", updating presence`);
                await this.setOpenToWave(userId, currentZone);
                return;
            }

            // No zone → clear open_to_wave
            console.log(`🗑️ [WaveService] User left all zones after 30 min. Clearing open_to_wave.`);
            await supabase
                .from('active_zone_users')
                .update({ open_to_wave: false, last_updated: new Date().toISOString() })
                .eq('user_id', userId);

            await AsyncStorage.removeItem(WAVE_TIMER_KEY);
        } catch (error) {
            console.error('❌ Error in resetOpenToWave:', error);
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
