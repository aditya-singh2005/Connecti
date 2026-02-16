// api/test-env.js
export default function handler(req, res) {
  res.status(200).json({
    success: true,
    envCheck: {
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      projectId: process.env.FIREBASE_PROJECT_ID || 'MISSING',
      clientEmailPreview: process.env.FIREBASE_CLIENT_EMAIL 
        ? process.env.FIREBASE_CLIENT_EMAIL.substring(0, 30) + '...' 
        : 'MISSING'
    }
  });
}