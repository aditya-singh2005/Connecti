// services/WaveService.js - Manages open_to_wave state with 30-min auto-reset
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const WAVE_TIMER_KEY = 'wave_timer_expiry';
const WAVE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

let resetTimeout = null;

export class WaveService {
    /**
     * Aggressively syncs the user's active zone presence to Supabase.
     * Can be called from foreground or background.
     */
    /**
     * Aggressively syncs the user's active zone presence to Supabase.
     * Can be called from foreground or background.
     */
    static async syncUserZone(userId, zoneName, location = null, openToWaveOverride = undefined) {
        try {
            console.log(`[Sync] 🌐 Syncing zone ${zoneName} for user ${userId}`);

            // 1. Get tokens
            const fcmToken = await AsyncStorage.getItem('fcm_device_token');
            const expoToken = await AsyncStorage.getItem('expo_push_token');

            // 2. Fetch zone details carefully
            let zoneId = null;
            let finalZoneName = zoneName;

            // If name is missing, try to get from storage
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

            // 3. Get existing state to preserve open_to_wave if active
            let openToWaveStatus = openToWaveOverride;

            if (openToWaveStatus === undefined) {
                const { data: existing } = await supabase
                    .from('active_zone_users')
                    .select('open_to_wave, last_updated')
                    .eq('user_id', userId)
                    .single();

                if (existing) {
                    const lastUpdate = new Date(existing.last_updated).getTime();
                    const now = new Date().getTime();
                    // If updated within 30 mins, preserve the status
                    if (now - lastUpdate < WAVE_DURATION_MS) {
                        openToWaveStatus = existing.open_to_wave;
                    } else {
                        openToWaveStatus = false;
                    }
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

                // UPSERT ensures one and only one entry per user
                const { error } = await supabase
                    .from('active_zone_users')
                    .upsert(upsertData, { onConflict: 'user_id' });

                if (error) throw error;

                // 4. Update local timer if open
                if (openToWaveStatus) {
                    const timerDataJson = await AsyncStorage.getItem(WAVE_TIMER_KEY);
                    let expiryTime;

                    if (timerDataJson && openToWaveOverride === undefined) {
                        const timerData = JSON.parse(timerDataJson);
                        // ✅ Refresh timer ONLY if zone name changes
                        if (finalZoneName !== timerData.zoneName) {
                            console.log(`[Sync] ♻️ Zone changed to ${finalZoneName}, refreshing wave timer`);
                            expiryTime = new Date().getTime() + WAVE_DURATION_MS;
                            // Reschedule local reset
                            this.scheduleAutoReset(userId, expiryTime);
                        } else {
                            expiryTime = timerData.expiryTime;
                        }
                    } else {
                        // ✅ Explicit 'WAVE' or 'AUTO-EXTEND', always fresh timer
                        console.log(`[Sync] 🔥 Explicit wave/extend in ${finalZoneName}, setting fresh 30m timer`);
                        expiryTime = new Date().getTime() + WAVE_DURATION_MS;
                        this.scheduleAutoReset(userId, expiryTime);
                    }

                    await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({
                        userId,
                        zoneName: finalZoneName,
                        expiryTime
                    }));
                }

                console.log(`[Sync] ✅ Successfully synced presence in ${finalZoneName} (Open: ${openToWaveStatus})`);
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

    static async setOpenToWave(userId, zoneName) {
        try {
            console.log(`🌊 Setting open_to_wave = true for user ${userId}`);

            // 1. Sync Active Zone Presence (Explicitly TRUE)
            // This is now the ONLY place where open_to_wave becomes true
            await this.syncUserZone(userId, zoneName, null, true);

            // 2. Setup Timer
            const expiryTime = new Date().getTime() + WAVE_DURATION_MS;
            await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({
                userId,
                zoneName,
                expiryTime
            }));

            console.log(`✅ open_to_wave set to true until ${new Date(expiryTime).toLocaleTimeString()}`);
            this.scheduleAutoReset(userId, expiryTime);

            return true;
        } catch (error) {
            console.error('❌ Error in setOpenToWave:', error);
            return false;
        }
    }

    static scheduleAutoReset(userId, expiryTime) {
        if (resetTimeout) clearTimeout(resetTimeout);

        const now = new Date().getTime();
        const delay = expiryTime - now;

        if (delay > 0) {
            resetTimeout = setTimeout(async () => {
                await this.resetOpenToWave(userId);
            }, delay);
        }
    }

    static async resetOpenToWave(userId) {
        try {
            const currentZone = await AsyncStorage.getItem('current_zone');

            if (currentZone) {
                console.log(`♻️ User still in ${currentZone}, auto-extending wave timer...`);
                // Use setOpenToWave to refresh both DB and local timer/reschedule reset
                return await this.setOpenToWave(userId, currentZone);
            }

            console.log(`🗑️ User left all zones and timer expired. Clearing record for ${userId}`);

            // Delete from DB
            await supabase.from('active_zone_users').delete().eq('user_id', userId);

            // Clear local tracking
            await AsyncStorage.removeItem(WAVE_TIMER_KEY);
            return true;
        } catch (error) {
            console.error('❌ Error in resetOpenToWave:', error);
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
        } catch (error) {
            return 0;
        }
    }
}
