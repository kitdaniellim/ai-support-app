// ─────────────────────────────────────────────────────────────────────────────
//  Sesame CSM TTS Client
//
//  Calls the local Sesame CSM API (OpenAI-compatible) to generate natural
//  human-sounding speech from text. If Sesame is unavailable, returns null
//  and the speak handler silently redirects back to <Gather>.
//
//  Timeout: 60s (generous for local GPU). The speak handler manages Twilio's
//  15s window separately via <Pause>+<Redirect> polling.
//
//  API: POST http://localhost:8999/v1/audio/speech
//  Docs: https://github.com/phildougherty/sesame_csm_openai
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SESAME_BASE_URL = process.env.SESAME_URL || 'http://localhost:8999';
const AUDIO_DIR = path.join(process.cwd(), 'tmp', 'audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

interface SesameOptions {
  voice?: string;     // alloy, echo, fable, onyx, nova, shimmer
  speed?: number;     // 0.5–2.0
  format?: string;    // mp3, wav, opus
  timeout?: number;   // ms — abort if generation takes too long
}

/**
 * Generate speech audio from text using Sesame CSM.
 * Returns the filename (not full path) of the generated audio file,
 * or null if Sesame is unavailable.
 */
export async function generateSpeech(
  text: string,
  callSid: string,
  options: SesameOptions = {},
): Promise<string | null> {
  const { voice = 'onyx', speed = 1.0, format = 'wav', timeout = 60000 } = options;
  const filename = `${callSid}-${Date.now()}.${format}`;
  const filepath = path.join(AUDIO_DIR, filename);

  try {
    const res = await fetch(`${SESAME_BASE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'csm-1b',
        input: text,
        voice,
        response_format: format,
        speed,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      console.error(`[sesame] API error: ${res.status} ${res.statusText}`);
      return null;
    }

    // Stream the audio response to a file
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    console.log(`[sesame] Generated ${filename} (${buffer.length} bytes)`);
    return filename;
  } catch (err) {
    console.error('[sesame] Generation failed:', (err as Error).message);
    return null;
  }
}

/**
 * Generate speech with context from a previous audio chunk.
 * Uses the /api/v1/audio/conversation endpoint for voice consistency
 * across multi-chunk responses. Falls back to standard generation if
 * the conversation endpoint fails.
 */
export async function generateSpeechWithContext(
  text: string,
  callSid: string,
  context: { text: string; audioFile: string },
  options: SesameOptions = {},
): Promise<string | null> {
  const { voice = 'onyx', format = 'wav', timeout = 60000 } = options;
  const filename = `${callSid}-${Date.now()}.${format}`;
  const filepath = path.join(AUDIO_DIR, filename);

  // Read previous chunk's audio and encode as base64
  const prevPath = path.join(AUDIO_DIR, context.audioFile);
  if (!fs.existsSync(prevPath)) {
    console.warn(`[sesame] Context audio not found: ${context.audioFile}, falling back to standard generation`);
    return generateSpeech(text, callSid, options);
  }

  const prevAudio = fs.readFileSync(prevPath);
  const prevBase64 = prevAudio.toString('base64');

  // Map voice name to speaker_id (Sesame uses 0-5 for the 6 standard voices)
  const voiceMap: Record<string, number> = {
    alloy: 0, echo: 1, fable: 2, onyx: 3, nova: 4, shimmer: 5,
  };
  const speakerId = voiceMap[voice] ?? 0;

  try {
    const res = await fetch(`${SESAME_BASE_URL}/api/v1/audio/conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        speaker_id: speakerId,
        context: [
          {
            speaker: speakerId,
            text: context.text,
            audio: prevBase64,
          },
        ],
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      console.error(`[sesame] Conversation API error: ${res.status} ${res.statusText}`);
      console.warn(`[sesame] Falling back to standard generation`);
      return generateSpeech(text, callSid, options);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    console.log(`[sesame] Generated WITH CONTEXT ${filename} (${buffer.length} bytes, context: ${context.audioFile})`);
    return filename;
  } catch (err) {
    console.error('[sesame] Context generation failed:', (err as Error).message);
    console.warn('[sesame] Falling back to standard generation');
    return generateSpeech(text, callSid, options);
  }
}

/**
 * Read a generated audio file. Returns null if not found.
 */
export function getAudioFile(filename: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(AUDIO_DIR, filename));
  } catch {
    return null;
  }
}

/**
 * Clean up old audio files (older than 5 minutes).
 * Orphaned greeting files (older than 24 hours) are also cleaned up —
 * they accumulate when a business changes their greeting text or voice.
 */
export function cleanupOldAudio(): void {
  const callCutoff     = Date.now() - 5 * 60 * 1000;       // 5 min for call audio
  const greetingCutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h for orphaned greetings
  try {
    const files = fs.readdirSync(AUDIO_DIR);
    for (const file of files) {
      const filepath = path.join(AUDIO_DIR, file);
      const stat = fs.statSync(filepath);
      const cutoff = file.startsWith('greeting-') ? greetingCutoff : callCutoff;
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filepath);
      }
    }
  } catch {
    // Cleanup is non-critical
  }
}

// ─── Greeting Audio Cache ──────────────────────────────────────────────────────
//
//  Greeting audio is generated once per business + greeting text + voice, then
//  cached on disk. The filename includes a hash of text+voice so cache
//  auto-invalidates when the business changes their greeting script or voice.

function greetingHash(text: string, voice: string): string {
  return crypto.createHash('md5').update(`${voice}:${text}`).digest('hex').substring(0, 8);
}

function greetingFilename(businessId: string, text: string, voice: string): string {
  return `greeting-${businessId}-${greetingHash(text, voice)}.wav`;
}

/**
 * Check if a cached greeting audio file exists for this business + text + voice.
 * Returns the filename if cached, null otherwise.
 */
export function getCachedGreeting(businessId: string, greetingText: string, voice = 'onyx'): string | null {
  const filename = greetingFilename(businessId, greetingText, voice);
  const filepath = path.join(AUDIO_DIR, filename);
  if (fs.existsSync(filepath)) {
    console.log(`[sesame] Greeting cache HIT: ${filename}`);
    return filename;
  }
  return null;
}

/**
 * Generate greeting audio and save it to the persistent greeting cache.
 * Returns the filename on success, null on failure.
 */
export async function generateGreeting(
  businessId: string,
  greetingText: string,
  options: SesameOptions = {},
): Promise<string | null> {
  const { voice = 'onyx', speed = 1.0, format = 'wav', timeout = 60000 } = options;
  const filename = greetingFilename(businessId, greetingText, voice);
  const filepath = path.join(AUDIO_DIR, filename);

  // Double-check cache (another request may have generated it concurrently)
  if (fs.existsSync(filepath)) {
    console.log(`[sesame] Greeting cache HIT (race): ${filename}`);
    return filename;
  }

  try {
    const res = await fetch(`${SESAME_BASE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'csm-1b',
        input: greetingText,
        voice,
        response_format: format,
        speed,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      console.error(`[sesame] Greeting API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    console.log(`[sesame] Greeting generated and cached: ${filename} (${buffer.length} bytes)`);
    return filename;
  } catch (err) {
    console.error('[sesame] Greeting generation failed:', (err as Error).message);
    return null;
  }
}
