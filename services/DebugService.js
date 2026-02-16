/**
 * DebugService - Centralized logging service for debugging
 * Provides screen-specific logging with persistence and subscription support
 */

class DebugServiceClass {
    constructor() {
        this.logs = {}; // { screenName: [logs] }
        this.subscribers = {}; // { screenName: [callbacks] }
        this.globalLogs = []; // All logs across all screens
        this.maxGlobalLogs = 500;
        this.maxScreenLogs = 100;
    }

    /**
     * Log a message for a specific screen
     * @param {string} screenName - Name of the screen
     * @param {string} level - Log level (INFO, ERROR, WARN, SUCCESS, GEOFENCE, NOTIFICATION, etc.)
     * @param {string} message - Log message
     * @param {object} data - Additional data to log
     */
    log(screenName, level, message, data = null) {
        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });

        const logEntry = {
            timestamp,
            level,
            message,
            data,
            screenName,
        };

        // Add to screen-specific logs
        if (!this.logs[screenName]) {
            this.logs[screenName] = [];
        }
        this.logs[screenName].push(logEntry);

        // Keep only last maxScreenLogs entries per screen
        if (this.logs[screenName].length > this.maxScreenLogs) {
            this.logs[screenName] = this.logs[screenName].slice(-this.maxScreenLogs);
        }

        // Add to global logs
        this.globalLogs.push(logEntry);
        if (this.globalLogs.length > this.maxGlobalLogs) {
            this.globalLogs = this.globalLogs.slice(-this.maxGlobalLogs);
        }

        // Notify subscribers
        if (this.subscribers[screenName]) {
            this.subscribers[screenName].forEach(callback => callback(logEntry));
        }

        // Also log to console for development
        const consoleMessage = `[${screenName}] [${level}] ${message}`;
        switch (level) {
            case 'ERROR':
                console.error(consoleMessage, data);
                break;
            case 'WARN':
                console.warn(consoleMessage, data);
                break;
            default:
                console.log(consoleMessage, data);
        }

        return logEntry;
    }

    /**
     * Subscribe to logs for a specific screen
     * @param {string} screenName - Name of the screen
     * @param {function} callback - Callback function to receive new logs
     * @returns {function} Unsubscribe function
     */
    subscribe(screenName, callback) {
        if (!this.subscribers[screenName]) {
            this.subscribers[screenName] = [];
        }
        this.subscribers[screenName].push(callback);

        // Return unsubscribe function
        return () => {
            this.subscribers[screenName] = this.subscribers[screenName].filter(cb => cb !== callback);
        };
    }

    /**
     * Get all logs for a specific screen
     * @param {string} screenName - Name of the screen
     * @returns {array} Array of log entries
     */
    getLogs(screenName) {
        return this.logs[screenName] || [];
    }

    /**
     * Get all global logs
     * @returns {array} Array of all log entries
     */
    getAllLogs() {
        return this.globalLogs;
    }

    /**
     * Clear logs for a specific screen
     * @param {string} screenName - Name of the screen
     */
    clearLogs(screenName) {
        this.logs[screenName] = [];
        this.log(screenName, 'INFO', 'Logs cleared');
    }

    /**
     * Clear all logs
     */
    clearAllLogs() {
        this.logs = {};
        this.globalLogs = [];
    }

    // Convenience methods for common log types

    info(screenName, message, data) {
        return this.log(screenName, 'INFO', message, data);
    }

    error(screenName, message, data) {
        return this.log(screenName, 'ERROR', message, data);
    }

    warn(screenName, message, data) {
        return this.log(screenName, 'WARN', message, data);
    }

    success(screenName, message, data) {
        return this.log(screenName, 'SUCCESS', message, data);
    }

    geofence(screenName, message, data) {
        return this.log(screenName, 'GEOFENCE', message, data);
    }

    notification(screenName, message, data) {
        return this.log(screenName, 'NOTIFICATION', message, data);
    }

    background(screenName, message, data) {
        return this.log(screenName, 'BACKGROUND', message, data);
    }

    ble(screenName, message, data) {
        return this.log(screenName, 'BLE', message, data);
    }

    wave(screenName, message, data) {
        return this.log(screenName, 'WAVE', message, data);
    }

    lifecycle(screenName, message, data) {
        return this.log(screenName, 'LIFECYCLE', message, data);
    }

    /**
     * Log geofence events with detailed information
     */
    logGeofenceEvent(screenName, eventType, geofenceData) {
        const message = `Geofence ${eventType}`;
        return this.geofence(screenName, message, {
            eventType,
            ...geofenceData,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Log notification events
     */
    logNotification(screenName, notificationType, notificationData) {
        const message = `Notification: ${notificationType}`;
        return this.notification(screenName, message, {
            type: notificationType,
            ...notificationData,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Log background task events
     */
    logBackgroundTask(screenName, taskName, taskData) {
        const message = `Background Task: ${taskName}`;
        return this.background(screenName, message, {
            task: taskName,
            ...taskData,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Log BLE events
     */
    logBLEEvent(screenName, eventType, bleData) {
        const message = `BLE ${eventType}`;
        return this.ble(screenName, message, {
            eventType,
            ...bleData,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Log Wave events
     */
    logWaveEvent(screenName, eventType, waveData) {
        const message = `Wave ${eventType}`;
        return this.wave(screenName, message, {
            eventType,
            ...waveData,
            timestamp: new Date().toISOString(),
        });
    }
}

export const DebugService = new DebugServiceClass();
