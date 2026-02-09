// services/WaveService.js - Manages open_to_wave state with 30-min auto-reset
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const WAVE_TIMER_KEY = 'wave_timer_expiry';
const WAVE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export class WaveService {
    static async setOpenToWave(userId, zoneName) {
        try {
            console.log(`🌊 Setting open_to_wave = true for user ${userId}`);

            // Set open_to_wave to true
            const { error } = await supabase
                .from('profiles')
                .update({ open_to_wave: true })
                .eq('id', userId);

            if (error) {
                console.error('❌ Failed to set open_to_wave:', error);
                return false;
            }

            // Calculate expiry time
            const expiryTime = new Date().getTime() + WAVE_DURATION_MS;

            // Store expiry in AsyncStorage
            await AsyncStorage.setItem(WAVE_TIMER_KEY, JSON.stringify({
                userId,
                zoneName,
                expiryTime
            }));

            console.log(`✅ open_to_wave set to true, will expire at ${new Date(expiryTime).toISOString()}`);

            // Schedule auto-reset
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
            console.log(`⏰ Scheduling auto-reset in ${Math.round(delay / 1000 / 60)} minutes`);

            setTimeout(async () => {
                await this.resetOpenToWave(userId);
            }, delay);
        }
    }

    static async resetOpenToWave(userId) {
        try {
            console.log(`🔄 Resetting open_to_wave to false for user ${userId}`);

            const { error } = await supabase
                .from('profiles')
                .update({ open_to_wave: false })
                .eq('id', userId);

            if (error) {
                console.error('❌ Failed to reset open_to_wave:', error);
                return false;
            }

            // Clear AsyncStorage
            await AsyncStorage.removeItem(WAVE_TIMER_KEY);

            console.log('✅ open_to_wave reset to false');
            return true;
        } catch (error) {
            console.error('❌ Error in resetOpenToWave:', error);
            return false;
        }
    }

    static async checkAndResumeTimer() {
        try {
            const timerData = await AsyncStorage.getItem(WAVE_TIMER_KEY);

            if (!timerData) {
                return; // No active timer
            }

            const { userId, zoneName, expiryTime } = JSON.parse(timerData);
            const now = new Date().getTime();

            if (now >= expiryTime) {
                // Timer expired while app was closed, reset now
                console.log('⏰ Timer expired while app was closed, resetting now');
                await this.resetOpenToWave(userId);
            } else {
                // Resume the timer
                console.log('⏰ Resuming wave timer');
                this.scheduleAutoReset(userId, expiryTime);
            }
        } catch (error) {
            console.error('❌ Error checking wave timer:', error);
        }
    }

    static async getRemainingTime() {
        try {
            const timerData = await AsyncStorage.getItem(WAVE_TIMER_KEY);

            if (!timerData) {
                return 0;
            }

            const { expiryTime } = JSON.parse(timerData);
            const now = new Date().getTime();
            const remaining = Math.max(0, expiryTime - now);

            return remaining;
        } catch (error) {
            console.error('❌ Error getting remaining time:', error);
            return 0;
        }
    }
}
