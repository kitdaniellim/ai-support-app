# VoiceIQ

AI-powered voice agent that answers inbound calls, holds natural conversations using neural TTS, qualifies leads, and streams live transcripts to a real-time dashboard — all configured per-business through a self-service onboarding wizard.

---

## Current Stack (Proof of Concept)

| Layer | Technology | Role |
|-------|-----------|------|
| **Framework** | Next.js 14 (App Router) | Pages, API routes, SSR |
| **AI (conversation)** | Claude Sonnet 4.6 | Responds to callers (max 150 tokens for voice brevity) |
| **AI (analysis)** | Claude Haiku 4.5 | Action items, post-call summaries (fast, cheap) |
| **Telephony** | Twilio Programmable Voice | Phone numbers, call routing, built-in STT via `<Gather speech>` |
| **TTS** | Sesame CSM 1B (local GPU) | Neural voice synthesis on RTX 3080, Docker on port 8999 |
| **Real-time** | Socket.IO | Live dashboard updates over WebSocket |
| **Database** | PostgreSQL (Neon serverless) + Prisma 5 | Call records, transcripts, businesses |
| **Animations** | GSAP 3 | Waveform, transcript bubbles |
| **Styling** | Tailwind CSS | Dark theme, responsive layout |
| **Tunnel** | ngrok | Exposes localhost to Twilio webhooks |

---

## How It Works (POC Flow)

```
Caller dials Twilio number
        |
        v
+------------------------------------------+
|  POST /api/webhooks/twilio               |
|                                          |
|  1. Lookup business by called number     |
|  2. AMD check (human callers only)       |
|  3. Create Call record + Session         |
|  4. Seed greeting into Claude history    |
|  5. Check Sesame greeting cache:         |
|     HIT  -> <Gather><Play>cached</Gather>|
|     MISS -> Start generation, redirect   |
|             to /speak for fresh clock    |
+-------------------+----------------------+
                    |
                    | Caller speaks
                    v
+------------------------------------------+
|  POST /api/webhooks/twilio/gather        |
|                                          |
|  1. Extract SpeechResult (Twilio STT)    |
|  2. Claude Sonnet generates response     |
|     - Full conversation history          |
|     - Business context, FAQs, tone       |
|     - Max 150 tokens (1-2 sentences)     |
|  3. Chunk response into sentences        |
|     (~40 chars/chunk for ~2.5s audio)    |
|  4. Start Sesame TTS for chunk 1         |
|  5. Persist messages to DB               |
|  6. Fire-and-forget: action item         |
|     analysis via Claude Haiku            |
|  7. Redirect to /speak                   |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
|  POST /api/webhooks/twilio/speak         |
|  (TTS playback with polling)             |
|                                          |
|  1. Await Sesame promise (12s timeout)   |
|  2. Audio ready?                         |
|     YES + more chunks:                   |
|       <Play>chunk.wav</Play>             |
|       Start next chunk (with context)    |
|       <Redirect> back to /speak          |
|     YES + last chunk:                    |
|       <Gather><Play>final.wav</Gather>   |
|       (caller can respond)               |
|     TIMEOUT:                             |
|       <Pause 2s><Redirect> retry         |
|       (up to 4 retries)                  |
+-------------------+----------------------+
                    |
                    | Caller speaks again
                    v
              (loop back to /gather)
                    |
                    | Caller hangs up
                    v
+------------------------------------------+
|  Status callback (PUT)                   |
|                                          |
|  1. Claude Haiku summarizes call         |
|     - Summary, sentiment, lead score     |
|     - Qualified? Next action?            |
|  2. Update Call record in DB             |
|  3. End session, cleanup audio files     |
+------------------------------------------+
```

### Real-Time Dashboard

Throughout every call, `SessionManager` emits events that `server.ts` broadcasts via Socket.IO to the business owner's dashboard:

| Event | Trigger | Dashboard Effect |
|-------|---------|-----------------|
| `call:started` | Call begins | Waveform activates, caller number shown |
| `call:transcript` | Each turn | Transcript bubble slides in (GSAP) |
| `call:amplitude` | During audio | Waveform bars pulse (~20fps, throttled) |
| `call:action_items` | After 2+ exchanges | Coaching suggestions appear |
| `call:ended` | Call finishes | Summary displayed, UI resets |

### Key POC Design Decisions

- **Sesame CSM on local GPU** — Human-quality neural TTS with zero per-minute API costs. Runs as a Docker container on an RTX 3080. Voice consistency across chunks is maintained via the `/api/v1/audio/conversation` endpoint, which conditions generation on the previous chunk's audio.
- **Twilio `<Gather speech>` for STT** — Uses Twilio's built-in speech recognition instead of a streaming WebSocket + external STT provider. Simpler to implement, but adds ~1-2s latency per turn versus streaming alternatives.
- **Chunked TTS with redirect polling** — Long AI responses are split into sentence-sized chunks (~40 chars each, ~2.5s audio). Each chunk gets its own `<Redirect>` to reset Twilio's 15-second TwiML execution clock. This prevents timeouts when the GPU takes longer than expected.
- **Greeting cache** — First call to a business generates the greeting via Sesame and caches the `.wav` file on disk. Subsequent calls serve the cached file instantly. Cache key is `md5(voice + text)`, so it auto-invalidates when the greeting or voice changes.
- **In-memory session state** — `SessionManager` stores active calls in a Map on `globalThis` (survives Next.js hot reloads). Fast for single-process, but doesn't survive server restarts. DB is the source of truth for completed calls.
- **Single-process architecture** — Next.js + Socket.IO + session state all live in one Node.js process (`server.ts`). Simple to develop but cannot scale horizontally.

---

## Project Structure

```
ai-support-app/
├── server.ts                    # Custom HTTP server (Next.js + Socket.IO)
├── prisma/schema.prisma         # Database schema (6 models)
│
├── src/app/
│   ├── onboarding/page.tsx      # 4-step business setup wizard
│   ├── dashboard/page.tsx       # Live call monitoring dashboard
│   └── api/
│       ├── businesses/          # CRUD for business tenants
│       │   └── [id]/route.ts    # GET, PATCH, DELETE single business
│       ├── calls/route.ts       # Paginated call history
│       ├── audio/[filename]/    # Serve TTS audio files to Twilio
│       └── webhooks/twilio/
│           ├── route.ts         # Inbound call + status callback
│           ├── gather/route.ts  # STT -> Claude AI -> chunk + TTS
│           └── speak/route.ts   # TTS playback with polling
│
├── src/components/
│   └── LiveCallMirror/          # Real-time call UI
│       ├── index.tsx            # Socket.IO + phase state machine
│       ├── Waveform.tsx         # GSAP animated audio bars
│       └── Transcript.tsx       # Scrolling message bubbles
│
├── src/lib/
│   ├── prisma.ts                # Prisma singleton
│   ├── session-manager.ts       # In-memory call sessions + EventEmitter
│   ├── claude/
│   │   ├── ai-agent.ts          # Claude: conversation, analysis, summaries
│   │   └── prompt-builder.ts    # Dynamic per-tenant system prompts
│   ├── tts/
│   │   ├── sesame-client.ts     # Sesame CSM client + greeting cache
│   │   └── pending-audio.ts     # In-flight TTS promise cache (globalThis)
│   └── telephony/
│       └── twiml.ts             # Shared TwiML + audio URL helpers
│
└── src/types/index.ts           # Shared TypeScript interfaces
```

---

## Database Schema

Six models, all scoped by `businessId` for multi-tenancy:

```
Business ----------------------+
  | 1:1                        | 1:N
  v                            v
ContextProfile              Call ----------------+
  (AI persona, FAQs,          | 1:N              | 1:N
   tone, voice, lead          v                  v
   criteria, escalation)   Message           ActionItem
                           (transcript)      (AI coaching)

Business --- 1:N --- BusinessUser (team members with roles)
```

| Model | Purpose |
|-------|---------|
| **Business** | Tenant root — name, phone number, active flag |
| **ContextProfile** | Everything the AI knows — description, services, FAQs, tone, greeting script, voice (Sesame), language, lead criteria, escalation rules, custom instructions |
| **Call** | Call record — Twilio SID, caller number/name, status, timestamps, duration, post-call summary, lead score (0-100), sentiment, next action |
| **Message** | Individual transcript turns — role (USER/ASSISTANT/SYSTEM), content, timestamp |
| **ActionItem** | Live coaching suggestions — suggestion text, priority (LOW-URGENT), category (discount/escalate/follow_up/upsell/etc.) |
| **BusinessUser** | Team members — email, name, role (OWNER/ADMIN/MEMBER/VIEWER) |

---

## Getting Started (POC)

### Prerequisites

- Node.js 18+
- PostgreSQL database ([Neon](https://neon.tech) free tier works)
- [Twilio account](https://www.twilio.com/try-twilio) with a phone number
- [Anthropic API key](https://console.anthropic.com)
- Sesame CSM running locally (Docker + NVIDIA GPU)
- [ngrok](https://ngrok.com) for tunneling

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in: DATABASE_URL, ANTHROPIC_API_KEY, TWILIO_* credentials

# 3. Push database schema
npx prisma db push

# 4. Start Sesame CSM (separate terminal)
docker run --gpus all -p 8999:8999 sesame-csm:latest

# 5. Start ngrok tunnel (separate terminal)
ngrok http 3000

# 6. Configure Twilio webhook
# Set your Twilio number's Voice URL to: https://<ngrok-url>/api/webhooks/twilio (POST)
# Set Status Callback URL to same URL (PUT)

# 7. Start the app
npm run dev
```

### Usage

1. Open `http://localhost:3000` — onboarding wizard appears
2. Configure your business (name, services, FAQ, AI persona, voice)
3. Redirected to dashboard — waiting for calls
4. Call your Twilio number — hear the AI greeting, have a conversation
5. Watch the live transcript and waveform on the dashboard

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Neon PostgreSQL connection string (pooled) |
| `DATABASE_URL_UNPOOLED` | Yes | — | Direct connection for migrations |
| `ANTHROPIC_API_KEY` | Yes | — | Claude API key |
| `TWILIO_ACCOUNT_SID` | Yes | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | — | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes | — | Your Twilio phone number |
| `SESAME_URL` | No | `http://localhost:8999` | Sesame CSM API base URL |
| `CLAUDE_CONVERSATION_MODEL` | No | `claude-sonnet-4-6` | Model for caller conversations |
| `CLAUDE_FAST_MODEL` | No | `claude-haiku-4-5-20251001` | Model for analysis + summaries |
| `PORT` | No | `3000` | Server port |

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/webhooks/twilio` | Inbound call — greeting + AMD + session creation |
| PUT | `/api/webhooks/twilio` | Status callback — post-call summary + DB update |
| POST | `/api/webhooks/twilio/gather` | Speech result → Claude AI → chunk TTS → redirect |
| POST | `/api/webhooks/twilio/speak` | Await TTS → play chunk → redirect or listen |
| GET | `/api/audio/[filename]` | Serve generated audio files to Twilio `<Play>` |
| POST | `/api/businesses` | Create business + context profile |
| GET | `/api/businesses` | List all businesses |
| GET | `/api/businesses/[id]` | Get business + profile + call count |
| PATCH | `/api/businesses/[id]` | Update business or profile settings |
| DELETE | `/api/businesses/[id]` | Delete business (cascades all data) |
| GET | `/api/calls` | Paginated call history (filter by businessId, status) |

---

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `ts-node server.ts` | Start dev server (Next.js + Socket.IO) |
| `build` | `next build` | Build for production |
| `start` | `NODE_ENV=production ts-node server.ts` | Start production server |
| `db:push` | `prisma db push` | Push schema to database |
| `db:generate` | `prisma generate` | Generate Prisma client |
| `db:studio` | `prisma studio` | Open Prisma Studio (database GUI) |
| `db:migrate` | `prisma migrate dev` | Create new migration |

---

## Costs (POC Testing)

| Service | Type | Cost | Notes |
|---------|------|------|-------|
| **Twilio** | Trial → upgraded | Free ($15.50 credit) | Phone number + voice calls + STT. Covers ~150+ min of test calls |
| **Anthropic API** | Pay-as-you-go | $5 minimum top-up | Sonnet + Haiku. $5 covers thousands of test turns |
| **Neon** | Free tier | $0 | PostgreSQL (0.5GB, auto-suspend) |
| **ngrok** | Free tier | $0 | Tunnel to public URL (changes on restart) |
| **Sesame CSM** | Self-hosted | $0 (requires NVIDIA GPU) | Local Docker container, no API costs |

**A typical 3-minute test call costs ~$0.03-0.05** (Twilio minutes + Claude tokens, TTS is free).

---

## Production Roadmap

The POC validates the core experience: an AI agent that sounds human, holds real conversations, and qualifies leads. Moving to production-ready multi-tenant SaaS requires replacing each POC shortcut with a scalable equivalent.

### Phase 1: Cloud TTS (Remove GPU Dependency)

> **Goal:** Deploy anywhere without requiring a local NVIDIA GPU.

| POC (Current) | Production (Target) | Why |
|----------------|--------------------|----|
| Sesame CSM on local RTX 3080 | **ElevenLabs** or **PlayHT** API | Auto-scales, sub-500ms latency, no hardware dependency. Pricing: ~$0.18-0.30 per 1K characters |
| `tmp/audio/` local file storage | **Cloudflare R2** or **AWS S3** | Audio accessible from any server instance. Presigned URLs for Twilio `<Play>` |
| Greeting cache on local disk | **R2/S3 + CDN** (Cloudflare) | Cached at the edge, <50ms TTFB worldwide |

**Migration steps:**
1. Create an ElevenLabs/PlayHT client with the same interface as `sesame-client.ts` (`generateSpeech()` returns a URL instead of a filename)
2. Upload generated audio to R2/S3 instead of `fs.writeFileSync()` to local disk
3. Return presigned URLs directly in TwiML `<Play>` tags (eliminates the `/api/audio/` route)
4. Move greeting cache to R2 with CDN distribution
5. Remove Docker/GPU dependency from deployment requirements

### Phase 2: Infrastructure (Enable Horizontal Scaling)

> **Goal:** Separate stateless frontend from stateful WebSocket server. Deploy to managed platforms.

| POC (Current) | Production (Target) | Why |
|----------------|--------------------|----|
| `server.ts` (single Node.js process) | **Vercel** (Next.js) + **Railway** or **Fly.io** (WebSocket server) | Independent scaling of HTTP and WebSocket workloads |
| ngrok tunnel | **Custom domain** with DNS | Real SSL, no tunnel dependency, stable URLs |
| In-memory `SessionManager` (Map) | **Redis** (Upstash serverless) | Sessions survive restarts, shared across instances |
| `globalThis` singletons | **Redis** keys with TTL | `pendingAudio` and sessions work across multiple processes |
| Neon free tier | **Neon Pro** or **Supabase** with connection pooling | Autoscaling compute, branching for staging, PgBouncer |
| Socket.IO on single server | **Socket.IO + Redis Adapter** | Multiple instances share rooms via Redis pub/sub |

**Migration steps:**
1. Deploy Next.js frontend + REST API to Vercel
2. Extract WebSocket server (Socket.IO + real-time events) to Railway or Fly.io
3. Replace `SessionManager` in-memory Map with Redis hash sets (`HSET session:{callSid} ...`)
4. Replace `pendingAudio` Map with Redis keys + 2-minute TTL
5. Add `@socket.io/redis-adapter` for multi-instance Socket.IO
6. Point Twilio webhooks and custom domain DNS to production URLs

### Phase 3: Streaming STT (Reduce Latency)

> **Goal:** Replace turn-based `<Gather>` with real-time streaming for natural, low-latency conversation.

| POC (Current) | Production (Target) | Why |
|----------------|--------------------|----|
| Twilio `<Gather speech>` (~1-2s latency) | **Twilio Media Streams** + **Deepgram** or **AssemblyAI** | Real-time streaming STT with ~200ms latency. Interim results enable faster AI responses |
| Turn-based conversation | **Full-duplex** with barge-in | Caller can interrupt the AI mid-sentence — feels like talking to a person |
| Separate `/gather` + `/speak` routes | **Single WebSocket connection** | Audio streams bidirectionally. No HTTP round-trips per turn |

**Migration steps:**
1. Replace `<Gather>` with `<Connect><Stream>` in the Twilio inbound webhook
2. Add WebSocket handler for Twilio Media Streams in the WebSocket server
3. Pipe raw audio (mulaw 8kHz) to Deepgram/AssemblyAI streaming API
4. On final transcript → Claude generates response → stream TTS audio back via RTP
5. Remove `/gather` and `/speak` routes (entire conversation happens over the WebSocket)
6. Implement barge-in detection (stop TTS playback when caller starts speaking)

### Phase 4: Multi-Tenant Features (Self-Service SaaS)

> **Goal:** Businesses sign up, configure, and pay — without manual intervention.

| POC (Current) | Production (Target) | Why |
|----------------|--------------------|----|
| localStorage `businessId` | **Clerk** or **NextAuth** with organizations | Real user accounts, team invites, SSO, MFA |
| Single dashboard | **Per-business dashboards** with org switcher | Each business sees only their calls, analytics, settings |
| Manual Twilio number config | **Twilio Subaccounts** or **Number Provisioning API** | Self-service: businesses buy/port numbers through the app |
| No billing | **Stripe** usage-based billing | Meter by minutes, calls, or AI tokens. Per-tenant invoicing |
| Basic Call + Message models | **Analytics pipeline** | Call volume trends, avg handle time, lead conversion, sentiment over time |

**Migration steps:**
1. Integrate Clerk (or NextAuth) with organization support and RBAC
2. Add `organizationId` to Business model (or use Clerk organization ID)
3. Build settings pages: team management, billing, number management
4. Integrate Stripe with usage metering (Twilio status callback → Stripe meter event)
5. Build analytics dashboards (aggregate queries, materialized views, or a tool like Metabase)
6. Add Twilio subaccount provisioning per business for number isolation

### Phase 5: Reliability and Observability

> **Goal:** Monitor, alert, and recover from failures automatically.

| POC (Current) | Production (Target) | Why |
|----------------|--------------------|----|
| `console.log` / `console.error` | **Structured logging** (Axiom, Datadog, or Betterstack) | Searchable, filterable, correlated by `callSid` |
| No monitoring | **OpenTelemetry** traces + **Sentry** errors | Trace a call from webhook → AI → TTS → dashboard. Alert on failures |
| No rate limiting | **Upstash Ratelimit** or **Cloudflare WAF** | Protect API routes from abuse. Per-business rate limits |
| No job queue | **Inngest** or **BullMQ** for background jobs | Retry failed summaries, process webhooks idempotently, schedule cleanups |
| 5-minute audio cleanup (in-process) | **Object lifecycle policies** (S3/R2) | Cloud storage auto-deletes old audio. No cron or interval needed |
| No webhook validation | **Twilio request signature verification** | Reject spoofed webhook requests. Use `twilio.validateRequest()` |

---

### Production Architecture (Target)

```
                    +---------------------+
                    |   Cloudflare        |
                    |   CDN + WAF         |
                    +----------+----------+
                               |
              +----------------+----------------+
              |                                 |
     +--------v--------+             +----------v-----------+
     |    Vercel        |             |   Railway / Fly.io   |
     |    (Next.js)     |             |   (WebSocket server) |
     |                  |             |                      |
     |  - Dashboard UI  |             |  - Socket.IO         |
     |  - REST API      |             |  - Twilio Media      |
     |  - Onboarding    |             |    Streams (STT)     |
     |  - Auth (Clerk)  |             |  - TTS streaming     |
     +--------+---------+             +----------+-----------+
              |                                  |
              +----------------+-----------------+
                               |
              +----------------+----------------+
              |                                 |
     +--------v--------+             +----------v-----------+
     |  Neon / Supabase |             |   Upstash Redis      |
     |  (PostgreSQL)    |             |   - Sessions         |
     |                  |             |   - Pub/Sub (Socket)  |
     +--------+---------+             |   - Rate limiting    |
              |                       +----------------------+
     +--------v--------+
     |  Cloudflare R2   |             +----------------------+
     |  (Audio files +  |             |   External APIs      |
     |   CDN)           |             |                      |
     +------------------+             |  - Anthropic Claude  |
                                      |  - ElevenLabs TTS    |
                                      |  - Deepgram STT      |
                                      |  - Twilio Voice      |
                                      |  - Stripe Billing    |
                                      +----------------------+
```

### Migration Priority

Phases can be tackled independently, but this order maximizes impact per effort:

| Priority | Phase | What It Unlocks | Effort |
|----------|-------|----------------|--------|
| **1** | Cloud TTS | Deploy anywhere (no GPU). Unblocks phase 2 | Low |
| **2** | Infrastructure | Real deployment, horizontal scaling, uptime | Medium |
| **3** | Multi-Tenant Features | Self-service signups, billing, team access | Medium |
| **4** | Streaming STT | Natural conversation feel, barge-in, <500ms latency | High |
| **5** | Reliability | Production monitoring, error recovery, security | Low-Medium |

---

## License

Private — not open source.
