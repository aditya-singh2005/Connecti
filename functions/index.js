const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Send push notification
exports.sendPushNotification = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const { token, title, body } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ 
        error: 'Missing required fields: token, title, body' 
      });
    }

    // Send notification using FCM
    const message = {
      token: token,
      notification: {
        title: title,
        body: body,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default',
        },
      },
    };

    const response = await admin.messaging().send(message);

    console.log('✅ Notification sent:', response);
    
    return res.status(200).json({ 
      success: true,
      messageId: response
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({ 
      error: error.message 
    });
  }
});