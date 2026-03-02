const twilio = require('twilio');
const fs = require('fs');

// Read .env manually
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)\s*=\s*"(.*)"\s*$/);
  if (m) env[m[1]] = m[2];
});

const sid = env.TWILIO_ACCOUNT_SID;
const token = env.TWILIO_AUTH_TOKEN;
console.log('SID:', sid ? sid.slice(0, 6) + '...' : 'MISSING');
console.log('Token:', token ? token.slice(0, 6) + '...' : 'MISSING');

const client = twilio(sid, token);
const url = 'https://unsplinted-engrainedly-nikola.ngrok-free.dev/api/webhooks/twilio';

client.incomingPhoneNumbers.list({ phoneNumber: '+14158497303' })
  .then(nums => {
    if (!nums[0]) { console.log('Number not found!'); return; }
    return client.incomingPhoneNumbers(nums[0].sid).update({
      voiceUrl: url,
      voiceMethod: 'POST',
      statusCallback: url,
      statusCallbackMethod: 'PUT',
    });
  })
  .then(n => { if (n) console.log('Webhook set:', n.voiceUrl); })
  .catch(e => console.error('Error:', e.message));
