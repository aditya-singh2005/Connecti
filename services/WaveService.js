// services/WaveService.js - Manages open_to_wave state with 30-min auto-reset
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const WAVE_TIMER_KEY = 'wave_timer_expiry';
const WAVE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export class WaveService {
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

            // 3. Get open_to_wave status (Use override if provided, else fetch)
            let openToWaveStatus = openToWaveOverride;
            if (openToWaveStatus === undefined) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('open_to_wave')
                    .eq('id', userId)
                    .single();
                openToWaveStatus = profile?.open_to_wave || false;
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
                console.log(`[Sync] ✅ Successfully synced presence in ${finalZoneName} (Open: ${openToWaveStatus})`);
                return true;
            } else {
                console.warn(`[Sync] ⚠️ Could not find zone_id for ${finalZoneName}, skip sync`);
                return false;
            }
        } catch (error) {
            console.error('[Sync] ❌ Failed to sync presence:', error.message);
            return false;
        }
    }

    static async setOpenToWave(userId, zoneName) {
        try {
            console.log(`🌊 Setting open_to_wave = true for user ${userId}`);

            // 1. Update Profile
            await supabase
                .from('profiles')
                .update({ open_to_wave: true })
                .eq('id', userId);

            // 2. Sync Active Zone Presence (Explicitly TRUE)
            await this.syncUserZone(userId, zoneName, null, true);

            // 3. Setup Timer
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
        const now = new Date().getTime();
        const delay = expiryTime - now;

        if (delay > 0) {
            setTimeout(async () => {
                await this.resetOpenToWave(userId);
            }, delay);
        }
    }

    static async resetOpenToWave(userId) {
        try {
            // Check for auto-refresh
            const timerData = await AsyncStorage.getItem(WAVE_TIMER_KEY);
            const currentZone = await AsyncStorage.getItem('current_zone');

            if (timerData && currentZone) {
                const { zoneName } = JSON.parse(timerData);
                if (zoneName === currentZone) {
                    console.log(`♻️ User still in ${zoneName}, auto-refreshing timer...`);
                    // Refresh behavior: Reset the timer, keep open_to_wave = true
                    return await this.setOpenToWave(userId, zoneName);
                }
            }

            console.log(`🔄 Resetting open_to_wave to false for user ${userId}`);

            await supabase
                .from('profiles')
                .update({ open_to_wave: false })
                .eq('id', userId);

            // If still actively tracked in a zone, update status to false
            if (currentZone) {
                await this.syncUserZone(userId, currentZone, null, false);
            } else {
                // If not in a zone locally, ensure we clean up the record
                console.log(`🗑️ Removing active_zone_user record for ${userId}`);
                await supabase.from('active_zone_users').delete().eq('user_id', userId);
            }

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
