// ─────────────────────────────────────────────────────────────────────────────
//  Simulate Call — Zero-Cost Webhook Test
//
//  Sends the exact same HTTP request that Twilio would send when a call comes
//  in. Tests your webhook handler, DB writes, session creation, and TwiML
//  response — without any real phone call.
//
//  Usage:  npx ts-node scripts/simulate-call.ts
//  Cost:   $0 (no Twilio usage)
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const FAKE_CALL_SID = `CA_test_${Date.now()}`;

async function simulateInboundCall() {
  console.log(`\n🧪 Simulating inbound call to your webhook...`);
  console.log(`   Target: ${APP_URL}/api/webhooks/twilio\n`);

  // ── Step 1: Simulate the initial inbound call webhook ──────────────────────
  const formData = new URLSearchParams({
    CallSid:       FAKE_CALL_SID,
    AccountSid:    'AC_simulated',
    From:          '+639322368116',
    To:            '+15822342076',
    CallStatus:    'ringing',
    Direction:     'inbound',
    CallerCity:    'Manila',
    CallerCountry: 'PH',
  });

  try {
    const res = await fetch(`${APP_URL}/api/webhooks/twilio`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    formData.toString(),
    });

    const twiml = await res.text();

    console.log(`📥 Response (${res.status}):\n`);
    // Pretty-print the TwiML
    console.log(twiml.replace(/></g, '>\n<').split('\n').map(l => '   ' + l).join('\n'));

    if (twiml.includes('<Say')) {
      console.log(`\n✅ Webhook is working! Your app returned a TwiML greeting.`);
    }
    if (twiml.includes('<Stream')) {
      console.log(`✅ Media Stream URL found — WebSocket handoff is configured.`);
    }
    if (twiml.includes('not currently configured')) {
      console.log(`⚠️  No active business found in DB. Run onboarding first.`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to reach webhook: ${err.message}`);
    console.error(`   Is your app running on ${APP_URL}?`);
    return;
  }

  // ── Step 2: Simulate call completion (status callback) ─────────────────────
  console.log(`\n🧪 Simulating call completion (status callback)...\n`);

  const statusData = new URLSearchParams({
    CallSid:      FAKE_CALL_SID,
    CallStatus:   'completed',
    CallDuration: '45',
  });

  try {
    const res = await fetch(`${APP_URL}/api/webhooks/twilio`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    statusData.toString(),
    });

    const body = await res.text();
    console.log(`📥 Status callback response (${res.status}): ${body}`);
    console.log(`\n✅ Full call lifecycle simulated. Check your dashboard and DB!\n`);
  } catch (err: any) {
    console.error(`❌ Status callback failed: ${err.message}`);
  }
}

simulateInboundCall();
