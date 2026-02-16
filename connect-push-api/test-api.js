const token = "cbHPJOgcQrmkp6108npwhT:APA91bHU8N2HKe2rSPmIzsKQyYmFp_jDlyJTeibbLg-0NKT666A--RV_8PSLKEowFY9oA-uirkDKZpVseTQVYp1XPAb6tjEPj-6MlWJzdJuVwq7FNf79hEY";

console.log('Testing Vercel API with token:', token);
console.log('Sending request to: https://connecti-push-api.vercel.app/api/send-notification');

fetch('https://connecti-push-api.vercel.app/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        token: token,
        title: 'Test from Script',
        body: 'Testing Vercel API Integration'
    })
})
    .then(async res => {
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Response:', text);
    })
    .catch(err => console.error('Error:', err));
