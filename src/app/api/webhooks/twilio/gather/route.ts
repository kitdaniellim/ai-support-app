// ─────────────────────────────────────────────────────────────────────────────
//  Twilio Gather Webhook — Conversation Loop
//
//  Twilio POSTs here each time it recognizes speech from the caller.
//  Flow:
//    1. Extract SpeechResult and CallSid from form data
//    2. Look up session + business context
//    3. Send caller text to Claude AI → get response (~3s)
//    4. Split response into TTS-safe chunks (~70 chars each)
//    5. Kick off Sesame TTS generation for chunk 1 (don't wait)
//    6. Persist messages to DB (fire-and-forget)
//    7. Return <Redirect> to /speak handler → fresh 15s clock for Sesame
//
//  Clock splitting:
//    Twilio gives 15s per webhook. AI (~3s) + Sesame (~10s) = 13s in one
//    handler is too risky. Instead, this handler does AI only (~3s) and
//    redirects to /speak, which gets its own 15s to await Sesame.
//
//  Chunked playback:
//    Long AI responses are split into sentence-sized chunks. The speak
//    handler plays each chunk and chains <Redirect>s — each hop gets a
//    fresh 15s clock. The caller hears the FULL response, never truncated.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sessionManager } from '@/lib/session-manager';
import { getAIResponse } from '@/lib/claude/ai-agent';
import { generateSpeech, cleanupOldAudio } from '@/lib/tts/sesame-client';
import { pendingAudio } from '@/lib/tts/pending-audio';
import { twiml } from '@/lib/telephony/twiml';
import type { AIAgentConfig } from '@/lib/claude/ai-agent';

const DEFAULT_LANG = 'en-US';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime    = Date.now();
  const formData     = await req.formData();
  const callSid      = formData.get('CallSid')      as string;
  const speechResult = formData.get('SpeechResult')  as string | null;

  // ── Validate session ──────────────────────────────────────────────────────
  const session = sessionManager.getSessionByCallSid(callSid);
  if (!session) {
    console.error(`[gather] No session for CallSid: ${callSid}`);
    return twiml(`<Hangup/>`);
  }

  if (session.status === 'connecting') {
    sessionManager.updateSession(session.sessionId, { status: 'active' });
  }

  // ── Fetch business context ────────────────────────────────────────────────
  const business = await prisma.business.findUnique({
    where:   { id: session.businessId },
    include: { contextProfile: true },
  });

  const lang  = business?.contextProfile?.language || DEFAULT_LANG;
  const voice = business?.contextProfile?.voiceName || 'onyx';

  if (!business || !business.contextProfile) {
    console.error(`[gather] Business not found: ${session.businessId}`);
    return twiml(`<Hangup/>`);
  }

  // ── Handle no speech / silence timeout ────────────────────────────────────
  //  No Polly voice — just re-listen. The caller will try again.
  if (!speechResult || speechResult.trim().length === 0) {
    return twiml(`
      <Gather input="speech" action="/api/webhooks/twilio/gather" method="POST"
              speechTimeout="auto" timeout="10" language="${lang}">
      </Gather>
      <Hangup/>
    `);
  }

  const speechText = speechResult.trim();
  console.log(`[gather] CallSid:${callSid} — Caller: "${speechText}"`);

  // ── Get AI response ───────────────────────────────────────────────────────
  const config: AIAgentConfig = {
    business,
    profile:      business.contextProfile,
    callerNumber: session.callerNumber,
  };

  let aiResponse: string;
  try {
    aiResponse = await getAIResponse(callSid, speechText, config);
  } catch (err) {
    console.error('[gather] AI response error:', err);
    // No Polly fallback — just re-listen
    return twiml(`
      <Gather input="speech" action="/api/webhooks/twilio/gather" method="POST"
              speechTimeout="auto" timeout="8" language="${lang}">
      </Gather>
      <Hangup/>
    `);
  }

  const aiMs = Date.now() - startTime;
  console.log(`[gather] CallSid:${callSid} — AI (${aiMs}ms): "${aiResponse.substring(0, 120)}..."`);

  // ── Persist messages to DB (fire-and-forget) ──────────────────────────────
  prisma.call.findUnique({ where: { twilioCallSid: callSid } })
    .then((call) => {
      if (!call) return;
      return prisma.message.createMany({
        data: [
          { callId: call.id, role: 'USER',      content: speechText },
          { callId: call.id, role: 'ASSISTANT',  content: aiResponse },
        ],
      });
    })
    .catch((err) => console.error('[gather] DB write error:', err));

  cleanupOldAudio();

  // ── Chunk the AI response and start generating chunk 1 ────────────────────
  //
  //  Split the full AI response into sentence-sized chunks (~70 chars each).
  //  Each chunk generates in ~8-10s on the RTX 3080, well within the 14s
  //  timeout. The speak handler chains <Redirect>s to play all chunks —
  //  each hop gets its own fresh 15s Twilio clock.
  //
  //  The full AI response is stored in the DB and conversation history.
  //  Only the TTS generation is chunked.
  //
  const chunks = chunkForTTS(aiResponse);
  console.log(`[gather] TTS chunks: ${chunks.length} — [${chunks.map(c => `"${c.substring(0, 30)}…" (${c.length}ch)`).join(', ')}]`);

  const sesamePromise = generateSpeech(chunks[0], callSid, { voice });
  pendingAudio.set(callSid, {
    promise:         sesamePromise,
    fullText:        aiResponse,
    currentChunk:    chunks[0],
    remainingChunks: chunks.slice(1),
    startedAt:       Date.now(),
    voice,
  });

  console.log(`[gather] Sesame chunk 1/${chunks.length} started, redirecting to /speak (${aiMs}ms elapsed)`);

  // ── Redirect to speak handler — gives Twilio a fresh 15s clock ────────────
  return twiml(`
    <Redirect method="POST">/api/webhooks/twilio/speak?lang=${encodeURIComponent(lang)}</Redirect>
  `);
}


/**
 * Split text into TTS-safe chunks at sentence boundaries.
 *
 * Sesame CSM on RTX 3080 generates at ~2.8–4.0x real-time factor (RTF).
 * Speech rate varies from ~12–22 chars/sec. Each chunk gets its own 15s
 * Twilio clock via chained <Redirect>s in the speak handler.
 *
 * Target: ~40 chars per chunk → ~2.5s audio → ~10s gen at 4.0x RTF.
 * This keeps each generation safely within the 14s client timeout, even
 * with back-to-back GPU thermal throttling (4.0x RTF observed in prod).
 * Worst case: 40ch at slow speech (12 ch/s) → 3.3s audio × 4.0x = 13.3s.
 *
 * The full AI response is ALWAYS played — nothing is dropped.
 */
function chunkForTTS(text: string): string[] {
  const MAX_CHUNK = 40;

  // Split on sentence boundaries (period, exclamation, question mark)
  const sentences = text.match(/[^.!?]+[.!?]+[\s]?/g);

  if (!sentences) {
    // No sentence boundaries — use whole text or split at clause/word boundary
    if (text.length <= MAX_CHUNK) return [text];
    return splitOversized(text, MAX_CHUNK);
  }

  const chunks: string[] = [];
  let current = '';

  for (const raw of sentences) {
    const sentence = raw.trim();

    if (!current) {
      // First sentence (or after a flush) — check if it's oversized
      if (sentence.length <= MAX_CHUNK) {
        current = sentence;
      } else {
        // Long sentence — split at comma/clause boundaries, then word boundaries
        chunks.push(...splitOversized(sentence, MAX_CHUNK));
      }
    } else if ((current + ' ' + sentence).length <= MAX_CHUNK) {
      // Combine short sentences into one chunk
      current += ' ' + sentence;
    } else {
      // Current chunk is full — flush it, then handle the new sentence
      chunks.push(current);
      if (sentence.length <= MAX_CHUNK) {
        current = sentence;
      } else {
        chunks.push(...splitOversized(sentence, MAX_CHUNK));
        current = '';
      }
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

/**
 * Split an oversized text segment into chunks ≤ maxChars.
 * Tries comma/clause boundaries first for natural pause points,
 * then falls back to word boundaries.
 */
function splitOversized(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    // Try comma or semicolon boundary first (natural clause break)
    const commaIdx = remaining.substring(0, maxChars).lastIndexOf(',');
    const semiIdx  = remaining.substring(0, maxChars).lastIndexOf(';');
    const clauseBreak = Math.max(commaIdx, semiIdx);

    if (clauseBreak > 20) {
      // Split after the comma/semicolon
      chunks.push(remaining.substring(0, clauseBreak + 1).trim());
      remaining = remaining.substring(clauseBreak + 1).trim();
      continue;
    }

    // Fall back to word boundary
    const lastSpace = remaining.substring(0, maxChars).lastIndexOf(' ');
    const splitAt = lastSpace > 15 ? lastSpace : maxChars;
    chunks.push(remaining.substring(0, splitAt).trim());
    remaining = remaining.substring(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
