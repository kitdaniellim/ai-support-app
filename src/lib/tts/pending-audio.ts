// ─────────────────────────────────────────────────────────────────────────────
//  Pending Audio Cache
//
//  In-memory store for in-flight Sesame TTS generations. The gather handler
//  kicks off generation and stores the promise here. The speak handler
//  awaits it — picking up a generation that's already been running for ~1s.
//
//  Supports multi-chunk responses: long AI responses are split into sentence-
//  sized chunks. The speak handler plays each chunk and chains <Redirect>s
//  to give each generation its own fresh 15s Twilio clock.
//
//  Uses globalThis so the Map survives Next.js dev-mode hot-reloads and is
//  shared across route handlers (same pattern as Prisma singleton).
// ─────────────────────────────────────────────────────────────────────────────

interface PendingGeneration {
  /** The in-flight Sesame generation promise for the current chunk */
  promise: Promise<string | null>;
  /** Full AI response text (for logging and error recovery) */
  fullText: string;
  /** The specific chunk text currently being generated */
  currentChunk: string;
  /** Remaining text chunks to generate after the current one */
  remainingChunks: string[];
  /** Timestamp when the current chunk's generation started */
  startedAt: number;
  /** Sesame voice name (alloy, echo, fable, onyx, nova, shimmer) */
  voice?: string;
  /** Previous chunk's audio filename — used as context for voice consistency */
  previousAudioFile?: string;
  /** Previous chunk's text — sent alongside audio for context conditioning */
  previousChunkText?: string;
}

// Attach to globalThis so all route handlers share the same Map instance,
// even when Next.js recompiles individual routes in dev mode.
const g = globalThis as typeof globalThis & {
  __pendingAudio?: Map<string, PendingGeneration>;
  __pendingAudioTimer?: ReturnType<typeof setInterval>;
};

if (!g.__pendingAudio) {
  g.__pendingAudio = new Map();
}

const pendingAudio = g.__pendingAudio;

// ─── TTL Cleanup ──────────────────────────────────────────────────────────────
//  Abandoned entries (caller hung up before speak handler ran) leak memory.
//  Sweep every 60s, evict entries older than 2 minutes.

const PENDING_TTL = 2 * 60 * 1000; // 2 minutes

if (!g.__pendingAudioTimer) {
  g.__pendingAudioTimer = setInterval(() => {
    const now = Date.now();
    for (const [callSid, entry] of pendingAudio) {
      if (now - entry.startedAt > PENDING_TTL) {
        pendingAudio.delete(callSid);
      }
    }
  }, 60_000);
}

export { pendingAudio };
export type { PendingGeneration };
