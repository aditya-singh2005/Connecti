// services/api.js
const API_URL = 'https://connecti-push-api.vercel.app/api/send-notification';

/**
 * Sends a Geofence Trigger to the backend.
 * This is called from the Background Task when the user enters a zone.
 * 
 * @param {object} payload - { userId, geofenceId, timestamp }
 */
export const sendGeofenceTrigger = async (payload) => {
    try {
        console.log('[API] Sending Geofence Trigger:', payload);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: payload.userId,
                geofenceId: payload.geofenceId,
                timestamp: payload.timestamp,
                token: payload.token,
                title: payload.title || "📍 Entered Zone",
                body: payload.body || `You have entered ${payload.geofenceId}`,
                data: {
                    type: 'GEOFENCE_ENTER',
                    zoneId: payload.geofenceId
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[API] Geofence Trigger Failed:', response.status, errorText);
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[API] Geofence Trigger Success:', data);
        return data;
    } catch (error) {
        console.error('[API] Network Error:', error);
        throw error;
    }
};
