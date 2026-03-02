// ─────────────────────────────────────────────────────────────────────────────
//  Test Call Script
//
//  Makes an outbound call from your Twilio number to your verified PH number.
//  When you pick up, Twilio fetches TwiML from your webhook — same flow as an
//  inbound call. This bypasses the trial restriction (outbound to verified
//  numbers is allowed).
//
//  Usage:  npx ts-node scripts/test-call.ts
//  Cost:   ~$0.27/min from your free $14.35 trial credit
// ─────────────────────────────────────────────────────────────────────────────

import twilio from 'twilio';

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN!;
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!;   // +15822342076
const TO_NUMBER   = '+639322368116';                     // Your verified PH number

// ngrok URL — update this if ngrok restarts
const NGROK_URL = process.env.NGROK_URL || 'https://unsplinted-engrainedly-nikola.ngrok-free.dev';

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

async function makeTestCall() {
  console.log(`\n📞 Initiating test call...`);
  console.log(`   From: ${FROM_NUMBER} (Twilio)`);
  console.log(`   To:   ${TO_NUMBER} (your phone)`);
  console.log(`   Webhook: ${NGROK_URL}/api/webhooks/twilio\n`);

  try {
    const call = await client.calls.create({
      to:   TO_NUMBER,
      from: FROM_NUMBER,
      url:  `${NGROK_URL}/api/webhooks/twilio`,
      statusCallback:       `${NGROK_URL}/api/webhooks/twilio`,
      statusCallbackMethod: 'PUT',
      statusCallbackEvent:  ['completed', 'failed', 'busy', 'no-answer'],
    });

    console.log(`✅ Call initiated!`);
    console.log(`   Call SID: ${call.sid}`);
    console.log(`   Status:   ${call.status}`);
    console.log(`\n📱 Your phone should ring shortly — pick up to hear the AI greeting!\n`);
  } catch (err: any) {
    console.error(`❌ Failed to initiate call: ${err.message}`);
    if (err.code === 21219) {
      console.error(`   → This number is not verified. Verify it at:`);
      console.error(`     https://console.twilio.com/us1/develop/phone-numbers/manage/verified\n`);
    }
  }
}

makeTestCall();
