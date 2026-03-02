// ─────────────────────────────────────────────────────────────────────────────
//  Twilio Speak Handler — Sesame TTS Playback (Multi-Chunk, Polling)
//
//  Called via <Redirect> from the gather handler (conversation responses) or
//  the initial webhook handler (first-time greeting generation).
//
//  Supports multi-chunk playback for long AI responses:
//    1. Race the current chunk's Sesame promise against a 12s handler window
//    2. If audio ready → play it
//       - More chunks? Start next generation, <Play>+<Redirect> to self
//       - Last chunk? <Gather><Play></Gather> so caller can respond
//    3. If 12s expires and Sesame is still generating → <Pause 2s>+<Redirect>
//       to self — gives Twilio a fresh 15s clock. Caller hears a brief
//       "thinking" pause. Retries up to MAX_RETRIES times (~60s total).
//
//  This polling pattern decouples Sesame's generation time from Twilio's 15s
//  webhook limit. Even if the GPU takes 30s+ for a chunk, the call survives.
//
//  IMPORTANT: No Polly fallback. Sesame is the only voice. If Sesame truly
//  fails (error, not just slow), we silently redirect to <Gather>.
//
//  Query params:
//    ?lang=en-US          — language for <Gather>
//    ?type=greeting       — indicates this is a greeting (not conversation)
//    ?retries=0           — polling retry count (added automatically)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { generateSpeech, generateSpeechWithContext } from '@/lib/tts/sesame-client';
import { pendingAudio } from '@/lib/tts/pending-audio';
import { twiml, audioUrl } from '@/lib/telephony/twiml';

const DEFAULT_LANG    = 'en-US';
const HANDLER_TIMEOUT = 12_000;  // 12s — leaves 3s headroom within Twilio's 15s
const MAX_RETRIES     = 4;       // 4 retries × ~14s each ≈ 56s max total wait

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const formData  = await req.formData();
  const callSid   = formData.get('CallSid') as string;

  // Query params passed from gather or initial webhook handler
  const url     = new URL(req.url);
  const lang    = url.searchParams.get('lang') || DEFAULT_LANG;
  const type    = url.searchParams.get('type') || 'conversation';
  const retries = parseInt(url.searchParams.get('retries') || '0', 10);

  // ── Retrieve pending Sesame generation ──────────────────────────────────
  const pending = pendingAudio.get(callSid);
  if (!pending) {
    console.error(`[speak] No pending audio for CallSid: ${callSid} (type: ${type})`);
    return twiml(`
      <Gather input="speech" action="/api/webhooks/twilio/gather" method="POST"
              speechTimeout="auto" timeout="8" language="${lang}">
      </Gather>
      <Hangup/>
    `);
  }

  // ── Race Sesame promise against handler timeout ─────────────────────────
  //
  //  We DON'T await the full promise — that could block 20-30s and bust
  //  Twilio's 15s window. Instead, race against 12s. If Sesame isn't done,
  //  return <Pause>+<Redirect> for a fresh clock. The Sesame fetch continues
  //  running in the background (the promise is still in pendingAudio).
  //
  let audioFile: string | null = null;
  let stillGenerating = false;

  try {
    const result = await Promise.race([
      pending.promise,
      new Promise<'__timeout__'>((resolve) =>
        setTimeout(() => resolve('__timeout__'), HANDLER_TIMEOUT),
      ),
    ]);

    if (result === '__timeout__') {
      stillGenerating = true;
    } else {
      audioFile = result;
    }
  } catch (err) {
    console.error(`[speak] Sesame ${type} generation error:`, err);
    // audioFile stays null, stillGenerating stays false → real failure
  }

  const totalMs = Date.now() - startTime;
  const genMs   = Date.now() - pending.startedAt;

  // ── Sesame still generating — pause and retry ───────────────────────────
  if (stillGenerating) {
    if (retries >= MAX_RETRIES) {
      // Give up after ~56s — something is very wrong
      pendingAudio.delete(callSid);
      console.error(`[speak] Sesame ${type} gave up after ${MAX_RETRIES} retries (${genMs}ms) for CallSid: ${callSid}`);
      return twiml(`
        <Gather input="speech" action="/api/webhooks/twilio/gather" method="POST"
                speechTimeout="auto" timeout="8" language="${lang}">
        </Gather>
        <Hangup/>
      `);
    }

    console.log(`[speak] Sesame ${type} still generating (${genMs}ms elapsed, retry ${retries + 1}/${MAX_RETRIES}) — parking caller`);

    // Caller hears a brief pause (like the person is thinking), then we retry
    return twiml(`
      <Pause length="2"/>
      <Redirect method="POST">/api/webhooks/twilio/speak?lang=${encodeURIComponent(lang)}&amp;type=${type}&amp;retries=${retries + 1}</Redirect>
    `);
  }

  // ── Sesame finished — play the audio ────────────────────────────────────
  const remaining = pending.remainingChunks;

  if (audioFile) {
    const playUrl = audioUrl(req, audioFile);

    console.log(`[speak] Sesame ${type} chunk ready: ${playUrl} (waited ${totalMs}ms, gen ${genMs}ms, retries: ${retries})`);

    // ── More chunks to play? Chain with <Redirect> ────────────────────────
    if (remaining.length > 0) {
      // Start generating the next chunk NOW — it'll be ~2-3s in by the time
      // Twilio finishes playing this chunk's audio and follows the redirect.
      // Use context-aware generation: pass THIS chunk's audio so the next
      // chunk matches the voice characteristics (pitch, timbre, volume).
      const voice = pending.voice || 'onyx';
      const nextPromise = generateSpeechWithContext(
        remaining[0],
        callSid,
        { text: pending.currentChunk, audioFile: audioFile },
        { voice },
      );
      pendingAudio.set(callSid, {
        promise:         nextPromise,
        fullText:        pending.fullText,
        currentChunk:    remaining[0],
        remainingChunks: remaining.slice(1),
        startedAt:       Date.now(),
        voice,
        previousAudioFile: audioFile,
        previousChunkText: pending.currentChunk,
      });

      console.log(`[speak] Starting next chunk WITH CONTEXT (${remaining.length} remaining): "${remaining[0].substring(0, 40)}…"`);

      // Play this chunk, then redirect for the next one.
      // <Play> is NOT inside <Gather> — caller can't barge in mid-response.
      return twiml(`
        <Play>${playUrl}</Play>
        <Redirect method="POST">/api/webhooks/twilio/speak?lang=${encodeURIComponent(lang)}&amp;type=${type}</Redirect>
      `);
    }

    // ── Last (or only) chunk — wrap in <Gather> for caller's response ────
    pendingAudio.delete(callSid);

    return twiml(`
      <Gather input="speech" action="/api/webhooks/twilio/gather" method="POST"
              speechTimeout="auto" timeout="8" language="${lang}">
        <Play>${playUrl}</Play>
      </Gather>
      <Hangup/>
    `);
  }

  // ── Sesame failed (error, not timeout) ─────────────────────────────────
  pendingAudio.delete(callSid);

  console.error(`[speak] Sesame ${type} FAILED after ${genMs}ms for CallSid: ${callSid}`);
  console.error(`[speak] Failed chunk: "${pending.currentChunk.substring(0, 80)}"`);
  console.error(`[speak] Full text was: "${pending.fullText.substring(0, 120)}"`);

  // Just go back to listening — no voice change, no Polly
  return twiml(`
    <Gather input="speech" action="/api/webhooks/twilio/gather" method="POST"
            speechTimeout="auto" timeout="8" language="${lang}">
    </Gather>
    <Hangup/>
  `);
}

