const admin = require('firebase-admin');
const serviceAccount = require('./fcm-v1-key.json');

// Initialize with the key file directly
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const token = "cbHPJOgcQrmkp6108npwhT:APA91bHU8N2HKe2rSPmIzsKQyYmFp_jDlyJTeibbLg-0NKT666A--RV_8PSLKEowFY9oA-uirkDKZpVseTQVYp1XPAb6tjEPj-6MlWJzdJuVwq7FNf79hEY";

const message = {
    token: token,
    notification: {
        title: "Test Notification",
        body: "Testing FCM token validity"
    },
    data: {
        type: "test"
    }
};

console.log('Attemping to send to token:', token);
console.log('Using project:', serviceAccount.project_id);

admin.messaging().send(message)
    .then((response) => {
        console.log('Successfully sent message:', response);
    })
    .catch((error) => {
        console.log('Error sending message:', error);
        if (error.code) console.log('Error Code:', error.code);
        if (error.message) console.log('Error Message:', error.message);
    });
