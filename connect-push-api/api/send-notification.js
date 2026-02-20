// api/send-notification.js
// FCM HTTP v1 API - Modern approach, no legacy key needed

const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Firebase Admin init error:', error);
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    console.log('📥 Request body:', req.body);

    const { token, title, body, data = {} } = req.body;

    // Validate
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: token'
      });
    }

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, body'
      });
    }

    // Check if Firebase Admin is initialized
    if (!admin.apps.length) {
      throw new Error('Firebase Admin not initialized. Check environment variables.');
    }

    // Prepare FCM message (v1 format)
    const message = {
      token: token,
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...data,
        timestamp: Date.now().toString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    };

    console.log('📤 Sending FCM message...');

    // Send via FCM v1
    const response = await admin.messaging().send(message);

    console.log('✅ FCM response:', response);

    return res.status(200).json({
      success: true,
      messageId: response,
      message: 'Notification sent successfully'
    });

  } catch (error) {
    console.error('❌ Error:', error);

    // Detailed error response
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'UNKNOWN',
      details: error.errorInfo || null,
    });
  }
}

// Test endpoint
export const config = {
  api: {
    bodyParser: true,
  },
};