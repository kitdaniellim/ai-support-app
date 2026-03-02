# VoiceIQ Architecture

## Overview

Multi-tenant AI voice agent SaaS. Businesses configure an AI phone agent that handles inbound calls via Twilio, responds using Claude (Anthropic), speaks using Sesame CSM (GPU-based TTS), and streams live transcripts to a dashboard via Socket.IO.

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Telephony** | Twilio Voice (webhooks) | Inbound calls, STT via `<Gather>`, audio playback via `<Play>` |
| **TTS** | Sesame CSM 1B (local RTX 3080) | Speech generation, OpenAI-compatible API on port 8999 |
| **LLM** | Claude API (Anthropic) | Conversational AI, action items, post-call summaries |
| **Server** | Custom Node.js + Next.js 14 App Router | HTTP routes + Socket.IO for dashboard |
| **Database** | PostgreSQL via Prisma | Business config, call records, messages, action items |
| **Real-time** | Socket.IO | Live transcript + waveform to dashboard |
| **Tunnel** | ngrok | Exposes localhost:3000 to Twilio (dev only) |

---

## System Components

```
+----------------------------------------------------------------------+
|                         YOUR SERVER (port 3000)                       |
|                                                                       |
|  +--------------+  +---------------+  +----------------+              |
|  |  Next.js     |  |  Session      |  |  Pending       |             |
|  |  App Router  |  |  Manager      |  |  Audio Map     |             |
|  |  (routes)    |  |  (in-memory)  |  |  (in-memory)   |             |
|  +------+-------+  +------+--------+  +-------+--------+             |
|         |                  |                   |                      |
|  +------+------------------+-------------------+-----+                |
|  |              Custom Node.js HTTP Server            |               |
|  |              + Socket.IO (port 3000)               |               |
|  +---------------------------+------------------------+               |
|                              |                                        |
+------------------------------+----------------------------------------+
                               |
             +-----------------+-----------------+
             |                 |                 |
             v                 v                 v
      +------------+   +------------+   +--------------+
      |  Twilio    |   |  Sesame    |   |  Claude API  |
      |  (calls)   |   |  CSM 1B   |   |  (Anthropic) |
      |            |   |  (GPU TTS) |   |              |
      +------------+   +------------+   +--------------+
                       localhost:8999   api.anthropic.com
```

---

## Call Flow

### Phase 1: Inbound Call

```
CALLER DIALS TWILIO NUMBER
         |
         v
+------------------------------------------------------------------+
|  POST /api/webhooks/twilio                           [15s max]   |
|                                                                   |
|  1. Parse From/To/CallSid from Twilio form data                  |
|  2. Multi-tenant lookup: Business by phoneNumber                  |
|  3. AMD check (AnsweredBy != "human" -> <Hangup/>)               |
|  4. DB: prisma.call.upsert() -- create call record               |
|  5. sessionManager.createSession() --> Socket.IO: call:started    |
|  6. Check greeting cache on disk                                  |
|                                                                   |
|  Cache HIT:                        Cache MISS:                    |
|  Return <Gather>                   Start generateGreeting()       |
|    <Play>cached.wav</Play>         Store in pendingAudio Map      |
|  </Gather>                         Return <Redirect>/speak        |
|                                      ?type=greeting               |
+------------------------------------------------------------------+
```

### Phase 2: Conversation Loop

```
CALLER SPEAKS
  |   Twilio built-in STT (<Gather input="speech">)
  |   speechTimeout="auto", timeout=8s
  v
+------------------------------------------------------------------+
|  POST /api/webhooks/twilio/gather                    [15s max]   |
|                                                                   |
|  1. Extract SpeechResult + CallSid                                |
|  2. Validate session, fetch business config                       |
|  3. getAIResponse(callSid, text, config) --> Claude API (~3s)     |
|     +-- Adds messages to session history                          |
|     +-- Socket.IO: call:transcript (user + assistant)             |
|     +-- Fire-and-forget: analyzeForActionItems()                  |
|  4. Fire-and-forget: persist messages to DB                       |
|  5. chunkForTTS(aiResponse) -> split into <=40-char chunks        |
|  6. generateSpeech(chunks[0]) -- start Sesame, don't await        |
|  7. Store all chunks in pendingAudio Map                          |
|  8. Return <Redirect>/speak -- fresh 15s clock                    |
+------------------------------------------------------------------+
         |
         v
+------------------------------------------------------------------+
|  POST /api/webhooks/twilio/speak                     [15s max]   |
|  (called once per chunk via <Redirect> chaining)                  |
|                                                                   |
|  1. Get pendingAudio entry for this callSid                       |
|  2. Race: Sesame promise vs 12s handler timeout                   |
|                                                                   |
|  +-- STILL GENERATING (12s expired, Sesame not done)              |
|  |   retries < 4? -> <Pause 2s/><Redirect /speak?retries=N+1>    |
|  |   retries = 4? -> give up -> <Gather></Gather><Hangup/>        |
|  |                                                                |
|  +-- AUDIO READY + more chunks remain                             |
|  |   Start generateSpeechWithContext(nextChunk, thisAudio)        |
|  |   Return <Play>thisChunk.wav</Play>                            |
|  |          <Redirect>/speak --- loops back to this handler       |
|  |                                                                |
|  +-- AUDIO READY + last chunk                                     |
|  |   Return <Gather>                                              |
|  |            <Play>lastChunk.wav</Play>                          |
|  |          </Gather> --- caller can respond (barge-in)           |
|  |                    --- loops back to CALLER SPEAKS             |
|  |                                                                |
|  +-- SESAME FAILED (error, not timeout)                           |
|      Return <Gather></Gather> -- silent, caller speaks again      |
+------------------------------------------------------------------+
```

### Phase 3: Call End

```
CALLER HANGS UP
         |
         v
+------------------------------------------------------------------+
|  POST /api/webhooks/twilio (CallStatus=completed)                 |
|                                                                   |
|  1. DB: update call status, endedAt, duration                     |
|  2. Fire-and-forget: generateCallSummary() --> Claude API         |
|     +-- Saves summary, sentiment, leadScore to Call record        |
|  3. sessionManager.endSession() --> Socket.IO: call:ended         |
|  4. Session purged from memory after 30s                          |
+------------------------------------------------------------------+
```

---

## Key Architectural Decisions

### Clock Splitting via `<Redirect>`

Twilio gives 15s per webhook response. AI response (~3s) + Sesame TTS (~10s) = 13s in a single handler is too risky. Instead, the gather handler does AI only and redirects to the speak handler, which gets its own fresh 15s clock.

### Chunked TTS Playback

Long AI responses are split into sentence-sized chunks (~40 chars). Each chunk generates in ~8-10s on the RTX 3080. The speak handler chains `<Redirect>`s to play all chunks -- each hop gets a fresh 15s clock. The full response is always played, never truncated.

**Voice Consistency**: Chunk 2+ uses Sesame's `/api/v1/audio/conversation` endpoint, passing the previous chunk's audio as base64 context. The CSM model conditions on this audio to match pitch, timbre, and volume. Chunk 1 uses the standard `/v1/audio/speech` endpoint (no context available). If the conversation endpoint fails, it falls back to standard generation gracefully.

### Polling Retry Pattern

If Sesame exceeds the 12s handler window, the speak handler returns `<Pause 2s/><Redirect>` instead of failing. This gives Twilio a fresh 15s clock and retries up to 4 times (~56s max total). The caller hears a brief "thinking" pause instead of the call dying.

### Greeting Cache

Greeting audio is generated once per business + greeting text, then cached on disk. The filename includes an MD5 hash of the text so the cache auto-invalidates when the greeting changes. First call triggers generation via `<Redirect>` to speak handler; subsequent calls play instantly.

### No Polly Fallback

Sesame is the only voice. If Sesame fails, the speak handler silently redirects to `<Gather>` (the caller can speak again). This avoids jarring voice switches mid-call. The trade-off is silence on failure instead of a robotic fallback.

### Fire-and-Forget DB Writes

Message persistence and action item analysis run as fire-and-forget promises. This keeps the gather handler fast (~3s for AI only) and avoids blocking the Twilio response.

---

## AI Agent Architecture

Three Claude API calls per conversation turn, each optimized for its role:

| Function | Model | Max Tokens | Trigger | Purpose |
|----------|-------|-----------|---------|---------|
| `getAIResponse()` | claude-sonnet-4-6 | 150 | Every caller turn | Conversational response (~3s) |
| `analyzeForActionItems()` | claude-haiku-4-5 | 400 | After every response (fire-and-forget) | Live coaching suggestions for dashboard |
| `generateCallSummary()` | claude-haiku-4-5 | 500 | Call ends (fire-and-forget) | Post-call summary, sentiment, lead score |

Conversation history is maintained in-memory on the `CallSession` object and sent as the full `messages[]` array to Claude on each turn.

---

## Data Persistence

```
In-Memory (lost on restart):       On Disk:                   Database (PostgreSQL):
-----------------------------      ----------------------     ----------------------
sessionManager                     tmp/audio/                 Business
  +-- sessions Map                   +-- greeting-*.wav         ContextProfile
  +-- callSidIndex Map               |   (permanent cache)    Call
  +-- businessIndex Map              +-- {callSid}-*.wav        +-- Messages[]
                                         (cleaned after 5m)     +-- ActionItems[]
pendingAudio Map
  +-- in-flight Sesame promises
```

---

## Database Schema (PostgreSQL via Prisma)

### Models

- **Business** -- Tenant record. `phoneNumber` (unique) used for multi-tenant routing.
- **ContextProfile** -- 1:1 with Business. AI agent configuration (description, services, FAQ, tone, greeting, lead criteria, escalation rules).
- **Call** -- One per Twilio CallSid (unique). Full lifecycle: status, duration, summary, sentiment, leadScore, leadQualified, nextAction.
- **Message** -- Conversation turns. Role: USER | ASSISTANT | SYSTEM.
- **ActionItem** -- AI-generated coaching suggestions. Priority: LOW | MEDIUM | HIGH | URGENT. Category: discount | escalate | follow_up | upsell | clarify | empathize | close.

### Key Enums

- **ToneType**: PROFESSIONAL, FRIENDLY, FORMAL, CASUAL, EMPATHETIC
- **CallStatus**: INITIATED, RINGING, IN_PROGRESS, ON_HOLD, VOICEMAIL_DETECTED, TRANSFERRED, COMPLETED, FAILED, NO_ANSWER, BUSY
- **Direction**: INBOUND, OUTBOUND

---

## Socket.IO Events

### Server -> Client

| Event | Payload | Trigger |
|-------|---------|---------|
| `active:sessions` | `CallSession[]` | On connect (if call in progress) |
| `call:started` | `CallSession` | `session:created` |
| `call:transcript` | `{ sessionId, message }` | `session:message` |
| `call:amplitude` | `{ sessionId, amplitude }` | `session:amplitude` (20fps, currently synthetic) |
| `call:action_items` | `{ sessionId, actionItems }` | `session:action_items` |
| `call:ended` | `{ sessionId }` | `session:ended` |

### Client -> Server

| Event | Payload | Effect |
|-------|---------|--------|
| `subscribe:business` | `businessId` | Joins business room, pushes active sessions |
| `dismiss:action` | `{ actionId }` | Updates ActionItem.dismissed in DB |

---

## Current Constraints

| Constraint | Impact | Workaround |
|-----------|--------|------------|
| Twilio 15s webhook limit | Can't generate long audio in one handler | `<Redirect>` chaining with fresh 15s per hop |
| RTX 3080 speed (2.8-5.3x RTF) | 40 chars takes 9-20s to generate | 40-char chunking + polling retries |
| Sesame default endpoint is stateless | Each chunk would generate independently | Context passing via `/api/v1/audio/conversation` -- each chunk conditions on previous chunk's audio |
| No real-time audio access | Webhook mode = Twilio handles audio | Dashboard waveform is synthetic (sine waves) |
| Single-process in-memory state | Sessions + pendingAudio lost on restart | Acceptable for POC/testing |

---

## File Map

```
server.ts                                    -- Custom Node.js server (Socket.IO + Next.js)
src/
  app/
    api/
      webhooks/twilio/
        route.ts                             -- Inbound call handler + status callbacks
        gather/route.ts                      -- Conversation loop (STT -> AI -> TTS chunk)
        speak/route.ts                       -- TTS playback (polling + multi-chunk chain)
      audio/[filename]/route.ts              -- Serves generated WAV files to Twilio
      businesses/route.ts                    -- CRUD for business tenants
      businesses/[id]/route.ts               -- Single business GET/PATCH
      calls/route.ts                         -- Paginated call list
    page.tsx                                 -- Landing page
    onboarding/page.tsx                      -- 4-step business setup wizard
    dashboard/page.tsx                       -- Live call monitor
  components/
    LiveCallMirror/
      index.tsx                              -- Main call experience (Socket.IO + phase FSM)
      Waveform.tsx                           -- GSAP-animated audio visualization
      Transcript.tsx                         -- Scrolling message bubbles
      ActionItems.tsx                        -- AI coaching cards (built, not mounted)
  lib/
    claude/
      ai-agent.ts                            -- Claude API: response, action items, summary
      prompt-builder.ts                      -- System prompt construction per-tenant
    tts/
      sesame-client.ts                       -- Sesame CSM API client + greeting cache
      pending-audio.ts                       -- In-memory Map for in-flight TTS promises
    session-manager.ts                       -- In-memory call sessions + EventEmitter
    prisma.ts                                -- Prisma singleton (globalThis pattern)
  types/index.ts                             -- Shared TypeScript types
prisma/
  schema.prisma                              -- Database schema
tmp/
  audio/                                     -- Generated WAV files (ephemeral + greeting cache)
```

---

## Production Roadmap: Media Streams + Streaming TTS

### Technology Changes

#### 1. Twilio: Webhooks -> Media Streams (WebSocket)

| | Current | Production | Why |
|---|---------|-----------|-----|
| Protocol | HTTP POST/response | WebSocket (bidirectional) | Removes 15s limit. Connection stays open for entire call. |
| TwiML | `<Gather>`, `<Play>`, `<Redirect>` | `<Connect><Stream>` | One TwiML response opens the stream. Everything after is WebSocket. |
| Audio flow | Twilio manages audio, sends text | Raw mulaw/PCM frames at 8kHz | Direct access to audio stream enables real-time processing. |

#### 2. STT: Twilio `<Gather>` -> Deepgram (streaming)

| | Current | Production | Why |
|---|---------|-----------|-----|
| Service | Twilio built-in `<Gather>` | Deepgram Nova-2 (streaming) | `<Gather>` not available in Media Streams mode. |
| Latency | ~1-2s after caller stops | ~300ms (streaming interim results) | Real-time processing as audio arrives. |
| Cost | Free (included in Twilio) | ~$0.0043/min | Trade-off: cost for speed. |

#### 3. TTS: Local GPU -> Cloud GPU (A100/H100)

| | Current | Production | Why |
|---|---------|-----------|-----|
| Hardware | RTX 3080 (2.8-5.3x RTF) | A100/H100 (~0.5-1.0x RTF) | Full response generates in one shot. No chunking. |
| Availability | Desktop must be on | 99.9% uptime SLA | Production calls need reliability. |
| Scaling | 1 concurrent call | 3-5+ concurrent calls | GPU handles multiple generations. |

#### 4. TTS Endpoint: Stateless -> Context-Aware

| | Current | Production | Why |
|---|---------|-----------|-----|
| Endpoint | `/v1/audio/speech` | `/api/v1/audio/conversation` | Context conditioning for voice consistency. |
| State | None between chunks | Previous audio as base64 context | Model references its own output, same voice throughout. |

#### 5. Audio Delivery: Files -> Streaming Frames

| | Current | Production | Why |
|---|---------|-----------|-----|
| Flow | Sesame -> WAV file -> HTTP -> Twilio `<Play>` | Sesame -> buffer -> WebSocket frames | Eliminates file I/O, sub-second first audio. |
| Latency | Full audio generates before playback | First frame plays while rest generates | Caller hears response within ~500ms. |

#### 6. Server: Route Handlers -> WebSocket Handler

| | Current | Production | Why |
|---|---------|-----------|-----|
| Handlers | 3 routes with `<Redirect>` chains | 1 WebSocket handler per call | Single persistent connection, no request/response cycle. |
| State | pendingAudio Map + query params | Local to WebSocket closure | No shared Maps needed. |

### What Stays the Same

- Claude API (same prompts, same conversation history)
- Session Manager (same events, add Redis for scaling)
- PostgreSQL / Prisma (same schema)
- Socket.IO dashboard (same events, gains real amplitude data)
- Business onboarding (same flow)
- Prompt builder (same system prompts)

### Target Production Flow

```
CALLER DIALS TWILIO NUMBER
         |
         v
+------------------------------------------------------------------+
|  POST /api/webhooks/twilio (one-time only)                        |
|  Return: <Connect><Stream url="wss://server/media-stream"/></Connect>
+------------------------------------------------------------------+
         |
         |  WebSocket opens (persistent for entire call)
         v
+------------------------------------------------------------------+
|  WEBSOCKET HANDLER                                                |
|                                                                   |
|  +----------+   +----------+   +----------+   +----------+       |
|  | Twilio   |   | Deepgram |   | Claude   |   | Sesame   |       |
|  | Audio In |-->| STT      |-->| AI       |-->| TTS      |       |
|  | (mulaw)  |   | (stream) |   | (stream) |   | (stream) |       |
|  +----------+   +-----+----+   +-----+----+   +-----+----+       |
|                       |              |              |              |
|                       v              v              v              |
|               interim text    AI tokens       audio frames        |
|               "What are..."   "Oh hey..."     [PCM bytes]         |
|                                                     |             |
|  +----------+                                       |             |
|  | Twilio   |<--------------------------------------+             |
|  | Audio Out|   Audio frames sent back over WebSocket              |
|  | (mulaw)  |   Caller hears response AS IT GENERATES             |
|  +----------+                                                     |
|                                                                   |
|  Latency: caller speaks -> hears response in ~2.3s                |
|  (vs. current: 9-15s)                                             |
+------------------------------------------------------------------+
```

### Migration Effort

| Change | Effort | Notes |
|--------|--------|-------|
| Cloud GPU hosting | Low | Same Docker image, different host (RunPod/Replicate) |
| Conversation endpoint | Low | Change URL + add base64 audio context |
| Remove chunking code | Low | Delete code from gather + speak handlers |
| Twilio Media Streams | Medium | New WebSocket handler in server.ts |
| Deepgram streaming STT | Medium | New service integration, replaces `<Gather>` |
| Streaming TTS pipeline | Medium | Buffer Sesame output, convert to mulaw, send frames |
| Real dashboard amplitude | Low | Pipe actual audio RMS to Socket.IO |
| Auth / multi-tenant security | High | Required before real users |

The migration is incremental. Moving to cloud GPU + dropping chunking is the highest-impact, lowest-effort change. Media Streams + Deepgram is the second phase for sub-second latency.
