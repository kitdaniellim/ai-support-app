# VoiceIQ — AI Voice Agent Platform

> Multi-tenant AI-powered voice agent that qualifies leads and handles customer calls — powered by Claude AI, Twilio, and Next.js.

Callers dial a business phone number → Twilio receives the call → Your app answers with an AI agent that knows the business inside out → The dashboard shows live transcripts, waveform, and AI coaching suggestions in real-time.

---

## How It Works

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────────────┐
│  Caller      │     │  Twilio Cloud    │     │  Your App (localhost:3000) │
│  dials       │────►│  receives call   │────►│  webhook: /api/webhooks/   │
│  +1 XXX...   │     │  sends webhook   │     │  twilio                    │
└──────────────┘     └──────────────────┘     └─────────────┬──────────────┘
                                                            │
                     ┌──────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  1. Look up Business   │
        │  2. Create Call record │
        │  3. Create Session     │
        │  4. Return TwiML:      │
        │     <Gather speech>    │
        │       <Say>greeting    │
        │     </Gather>          │
        └───────────┬────────────┘
                    │
                    ▼
        ┌────────────────────────────────────────────────┐
        │  CONVERSATION LOOP (repeats each turn)         │
        │                                                │
        │  Caller speaks                                 │
        │       │                                        │
        │       ▼                                        │
        │  Twilio STT (built-in speech recognition)      │
        │       │                                        │
        │       ▼                                        │
        │  POST /api/webhooks/twilio/gather              │
        │       │  { SpeechResult: "caller's words" }    │
        │       │                                        │
        │       ▼                                        │
        │  Claude AI (Opus 4.6) generates response       │
        │       │  - reads full conversation history     │
        │       │  - knows company, services, FAQs       │
        │       │  - qualifies leads, follows tone       │
        │       │                                        │
        │       ▼                                        │
        │  Return TwiML:                                 │
        │    <Gather speech>                             │
        │      <Say>AI response</Say>  ←── caller hears │
        │    </Gather>                                   │
        │       │                                        │
        │       └──── loops back to "Caller speaks" ─────┘
        └────────────────────────────────────────────────┘
                    │
                    │  (meanwhile, in real-time)
                    ▼
        ┌────────────────────────────────────────────────┐
        │  LIVE DASHBOARD (Socket.IO)                    │
        │                                                │
        │  • Transcript bubbles appear as turns happen   │
        │  • AI coaching suggestions fly in              │
        │  • Waveform animates to call amplitude         │
        │  • Action items (lead signals, objections)     │
        └────────────────────────────────────────────────┘
                    │
                    │  (when caller hangs up)
                    ▼
        ┌────────────────────────────────────────────────┐
        │  POST-CALL ANALYSIS (Claude Haiku)             │
        │                                                │
        │  • Summary of the conversation                 │
        │  • Sentiment analysis                          │
        │  • Lead score (0-100)                          │
        │  • Lead qualified? (yes/no)                    │
        │  • Recommended next action                     │
        └────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Framework | Next.js 14 (App Router) | Pages, API routes, SSR |
| AI (conversation) | Claude Opus 4.6 | Responds to callers (max 300 tokens for voice brevity) |
| AI (analysis) | Claude Haiku 4.5 | Action items, post-call summaries (fast, <500ms) |
| Telephony | Twilio Voice | Phone numbers, call routing, built-in STT + TTS |
| Real-time | Socket.IO | Live dashboard updates over WebSocket |
| Database | PostgreSQL (Neon) + Prisma ORM | Call records, transcripts, businesses |
| Animations | GSAP 3 | Waveform, transcript bubbles, action item cards |
| Styling | Tailwind CSS | Dark theme, responsive layout |
| Language | TypeScript | End-to-end type safety |

---

## Quick Start

### 1. Install

```bash
git clone <repo>
cd ai-support-app
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Fill in your `.env`:

| Variable | Required | Where to get it |
|----------|----------|-----------------|
| `DATABASE_URL` | Yes | [Neon](https://neon.tech) or any PostgreSQL |
| `DATABASE_URL_UNPOOLED` | Yes | Same DB, direct connection (for migrations) |
| `ANTHROPIC_API_KEY` | Yes | [console.anthropic.com](https://console.anthropic.com) |
| `TWILIO_ACCOUNT_SID` | Yes | [console.twilio.com](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Console → Account Info |
| `TWILIO_PHONE_NUMBER` | Yes | Your purchased Twilio number |
| `PORT` | No | Default: 3000 |

### 3. Database

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
```

### 4. Run

```bash
npm run dev
# App runs at http://localhost:3000
```

### 5. Expose to Twilio (local dev only)

Twilio needs to reach your app via a public URL. Use [ngrok](https://ngrok.com):

```bash
ngrok http 3000
# Gives you: https://abc123.ngrok-free.dev
```

Configure your Twilio phone number (Console → Phone Numbers → your number):

| Setting | Value |
|---------|-------|
| A call comes in | Webhook: `https://YOUR-NGROK-URL/api/webhooks/twilio` (POST) |
| Call status changes | `https://YOUR-NGROK-URL/api/webhooks/twilio` (PUT) |

### 6. Test

```bash
# Zero-cost simulation (no phone needed):
npx ts-node scripts/simulate-call.ts

# Real call (uses Twilio credit):
npx ts-node scripts/test-call.ts
```

---

## Application Flow — Start to Finish

### Phase 1: Business Onboarding

A business owner visits `/onboarding` and completes a 4-step wizard:

1. **Business Info** — Company name, phone number, description
2. **Services & FAQ** — What they offer, common questions + answers
3. **AI Persona** — Tone of voice (Professional/Friendly/Casual/etc.), greeting script, custom instructions
4. **Lead Criteria** — What info to collect (name, email, budget), disqualifiers

This creates a `Business` + `ContextProfile` in the database. The context profile drives everything the AI agent knows and how it behaves.

### Phase 2: Incoming Call

When someone calls the Twilio number:

1. **Twilio** receives the call and POSTs to your webhook (`/api/webhooks/twilio`)
2. **Webhook handler** (`src/app/api/webhooks/twilio/route.ts`):
   - Looks up the `Business` by the called phone number (multi-tenant)
   - Checks Answering Machine Detection — if voicemail, plays a message and hangs up
   - Creates a `Call` record in the database (status: IN_PROGRESS)
   - Creates an in-memory `CallSession` via the `SessionManager`
   - Returns TwiML with `<Gather speech>` wrapping `<Say>` (the greeting)
3. **Twilio** plays the greeting to the caller using Amazon Polly TTS
4. The `<Say>` is nested inside `<Gather>`, so the caller can **barge in** (interrupt the greeting to start talking immediately)

### Phase 3: Conversation Loop

Each time the caller speaks:

1. **Twilio's built-in speech recognition** converts voice to text
2. **Twilio POSTs** to `/api/webhooks/twilio/gather` with `SpeechResult`
3. **Gather handler** (`src/app/api/webhooks/twilio/gather/route.ts`):
   - Retrieves the in-memory session by `CallSid`
   - Fetches the business's `ContextProfile` from the database
   - Calls `getAIResponse()` which:
     - Adds the caller's message to conversation history
     - Builds a **dynamic system prompt** with company context, services, FAQs, tone, lead criteria, and escalation rules
     - Sends the full conversation + system prompt to **Claude Opus 4.6**
     - Claude responds with a concise, voice-appropriate reply (max 300 tokens)
     - Adds the AI response to conversation history
   - **Async (fire-and-forget)**: Sends transcript to **Claude Haiku** for action item analysis
   - Persists both messages (user + assistant) to the `Message` table
   - Returns TwiML: `<Gather speech><Say>AI response</Say></Gather>` — loops back

This loop continues until the caller hangs up or times out.

### Phase 4: Real-Time Dashboard

Throughout the call, the `SessionManager` emits events that `server.ts` broadcasts via Socket.IO:

| Event | When | Dashboard Effect |
|-------|------|-----------------|
| `call:started` | Call begins | Card animates in with caller number |
| `call:transcript` | Each turn | Message bubble slides up with GSAP |
| `call:amplitude` | During audio | Waveform bars pulse (throttled to ~20fps) |
| `call:action_items` | After 2+ exchanges | Coaching cards fly in (color-coded by priority) |
| `call:ended` | Call finishes | Card fades out |

The dashboard at `/dashboard` subscribes to a Socket.IO room keyed by `business:{businessId}`, so each business owner only sees their own calls.

### Phase 5: Post-Call Analysis

When the call ends:

1. **Twilio** sends a status callback (PUT) with `CallStatus` and `CallDuration`
2. **Status handler** updates the `Call` record (endedAt, duration, status)
3. **Fire-and-forget**: `generateCallSummary()` sends the full transcript to Claude Haiku, which returns:
   - **Summary** — 2-3 sentence recap
   - **Sentiment** — positive/neutral/negative
   - **Lead Score** — 0-100
   - **Lead Qualified** — yes/no based on the business's criteria
   - **Next Action** — recommended follow-up
4. All fields are persisted to the `Call` record
5. The session is purged from memory after 30 seconds

---

## Architecture

### Multi-Tenancy

Each `Business` is an isolated tenant:

- **Isolated AI behavior** — `ContextProfile` (tone, FAQs, instructions) is loaded per-call
- **Isolated call history** — `Call`, `Message`, `ActionItem` records scoped by `businessId`
- **Isolated dashboard** — Socket.IO rooms keyed by `business:{businessId}`
- **Isolated users** — `BusinessUser` with roles: OWNER, ADMIN, MEMBER, VIEWER

### AI Orchestration

Two Claude models are used strategically:

| Model | Used For | Why |
|-------|----------|-----|
| **Opus 4.6** | Conversational turns | Smart, nuanced, handles complex queries |
| **Haiku 4.5** | Action items, summaries, voicemail detection | Fast (<500ms), cheap, parallelizable |

The system prompt is rebuilt per-call using `buildSystemPrompt()` in `src/lib/claude/prompt-builder.ts`. It injects the tenant's company description, services, FAQs, tone, lead criteria, escalation rules, and caller context.

### Real-Time Pipeline

```
Next.js API Routes (stateless HTTP)
        │
        ▼
SessionManager (in-memory singleton, EventEmitter)
        │
        ▼
server.ts (listens to events, broadcasts)
        │
        ▼
Socket.IO (WebSocket to browser)
        │
        ▼
LiveCallMirror React component (GSAP animations)
```

---

## Database Schema

```
Business ─────────────────────────────┐
  │ 1:1                               │ 1:N
  ▼                                   ▼
ContextProfile                     Call ────────────────┐
  (AI persona, FAQs,                │ 1:N              │ 1:N
   tone, lead criteria)             ▼                  ▼
                                 Message           ActionItem
                               (transcript)      (AI coaching)

Business ─── 1:N ─── BusinessUser (team members)
```

### Key Models

| Model | Purpose |
|-------|---------|
| `Business` | Tenant root — name, phone number, active status |
| `ContextProfile` | Everything the AI needs — description, services, FAQs, tone, greeting, voice, language, lead criteria, escalation rules |
| `Call` | Call record — Twilio SID, caller number, status, timestamps, lead score, sentiment, summary |
| `Message` | Each conversation turn — role (USER/ASSISTANT/SYSTEM), content, timestamp |
| `ActionItem` | Real-time AI coaching — suggestion, priority (LOW/MEDIUM/HIGH/URGENT), category |
| `BusinessUser` | Team member — email, name, role (OWNER/ADMIN/MEMBER/VIEWER) |

---

## File Structure

```
ai-support-app/
├── server.ts                              # Custom Node server: Socket.IO + event routing
├── prisma/
│   └── schema.prisma                      # Database models & enums
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # Root HTML layout (dark mode)
│   │   ├── page.tsx                       # Landing page
│   │   ├── onboarding/page.tsx            # 4-step business setup wizard
│   │   ├── dashboard/page.tsx             # Live call dashboard
│   │   └── api/
│   │       ├── webhooks/twilio/
│   │       │   ├── route.ts              # POST: inbound call, PUT: status callback
│   │       │   └── gather/route.ts       # POST: speech → Claude AI → response loop
│   │       ├── businesses/
│   │       │   ├── route.ts              # POST: create, GET: list
│   │       │   └── [id]/route.ts         # GET: detail, PATCH: update
│   │       └── calls/route.ts            # GET: paginated call history
│   ├── components/
│   │   └── LiveCallMirror/
│   │       ├── index.tsx                  # Socket.IO orchestrator + state management
│   │       ├── Waveform.tsx               # GSAP animated audio bars
│   │       ├── Transcript.tsx             # GSAP scrolling message bubbles
│   │       └── ActionItems.tsx            # GSAP animated coaching cards
│   ├── lib/
│   │   ├── prisma.ts                      # Singleton PrismaClient
│   │   ├── session-manager.ts             # In-memory sessions + EventEmitter
│   │   └── claude/
│   │       ├── ai-agent.ts               # Claude API: conversation, analysis, summaries
│   │       └── prompt-builder.ts          # Dynamic system prompt assembly
│   └── types/index.ts                     # Shared TypeScript interfaces
├── scripts/
│   ├── simulate-call.ts                   # Test webhook locally (zero-cost)
│   └── test-call.ts                       # Trigger real outbound test call
├── package.json
├── tsconfig.json                          # TypeScript config (Next.js)
├── tsconfig.server.json                   # TypeScript config (server.ts)
├── next.config.js                         # Next.js config (socket.io externals)
├── tailwind.config.js                     # Tailwind theme (Inter, slate/cyan)
└── postcss.config.js
```

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/webhooks/twilio` | Twilio inbound call webhook — returns TwiML |
| PUT | `/api/webhooks/twilio` | Twilio call status callback (completed/failed) |
| POST | `/api/webhooks/twilio/gather` | Speech recognition result — Claude AI loop |
| POST | `/api/businesses` | Create a new business tenant |
| GET | `/api/businesses` | List all businesses |
| GET | `/api/businesses/[id]` | Get business + context profile |
| PATCH | `/api/businesses/[id]` | Update business or context profile |
| GET | `/api/calls?businessId=X` | Paginated call history with message/action counts |

---

## npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `ts-node server.ts` | Start dev server (Next.js + Socket.IO) |
| `build` | `next build` | Build for production |
| `start` | `NODE_ENV=production ts-node server.ts` | Start production server |
| `db:generate` | `prisma generate` | Generate Prisma client from schema |
| `db:push` | `prisma db push` | Push schema changes to database |
| `db:studio` | `prisma studio` | Open Prisma Studio (database GUI) |
| `db:migrate` | `prisma migrate dev` | Run database migrations |

---

## Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  VoiceIQ Dashboard               Acme Consulting Group       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  LIVE CALL          +63 932 236 8116         02:47     │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌  │  │
│  ├───────────────────────┬────────────────────────────────┤  │
│  │  Live Transcript      │  AI Coaching Suggestions       │  │
│  │                       │                                │  │
│  │  Caller: Hi, I'm     │  HIGH  Lead Signal             │  │
│  │  interested in your   │  Customer asked about pricing  │  │
│  │  AI consulting...     │  — mention free consultation   │  │
│  │                       │                                │  │
│  │  AI: Welcome! I'd    │  MEDIUM  Objection             │  │
│  │  love to tell you     │  Budget concern detected —     │  │
│  │  about our services.  │  highlight ROI metrics         │  │
│  │  What specific area   │                                │  │
│  │  interests you?       │                                │  │
│  └───────────────────────┴────────────────────────────────┘  │
│                                                              │
│  ┌─ Recent Calls ─────────────────────────────────────────┐  │
│  │  +63 932 XXX  │  3:24  │  Score: 85  │  Qualified     │  │
│  │  +1 415 XXX   │  1:02  │  Score: 30  │  Not Qualified │  │
│  │  +44 20 XXX   │  5:11  │  Score: 92  │  Qualified     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Costs

### Per-Call Costs (Production)

| Service | Cost | Notes |
|---------|------|-------|
| Twilio phone number | ~$1-3/month | Varies by country |
| Twilio voice (inbound) | ~$0.0085-0.01/min | Includes built-in STT + TTS |
| Claude Opus (conversation) | ~$0.015-0.075/turn | Based on context length |
| Claude Haiku (analysis) | ~$0.001-0.003/turn | Very cheap |
| Neon PostgreSQL | Free tier | 0.5GB storage, auto-suspend |

**A typical 3-minute call costs ~$0.07-0.15 total.**

### Credits, Subscriptions & Payments for Testing

Everything you need to test this application end-to-end:

| Service | Type | Cost | What you get | Sign up |
|---------|------|------|-------------|---------|
| **Twilio** | Account (upgraded from trial) | Free (trial gives $15.50 credit) | Phone number, voice calls, STT/TTS — credit covers ~150+ min of test calls | [twilio.com](https://www.twilio.com/try-twilio) |
| **Anthropic API** | Pay-as-you-go credits | $5 minimum top-up | Claude Opus + Haiku API access — $5 covers thousands of test turns | [console.anthropic.com](https://console.anthropic.com/settings/billing) |
| **Neon** | Free tier | $0 | PostgreSQL database (0.5GB, auto-suspend after inactivity) | [neon.tech](https://neon.tech) |
| **ngrok** | Free tier | $0 | Tunnel localhost to public URL (URL changes on restart) | [ngrok.com](https://ngrok.com) |
| **Viber Out** | Subscription | ~$5.99/month or per-minute credits | Cheap international calls from your phone to test dialing the Twilio number | [viber.com](https://account.viber.com/en/viber-out) |
| **Claude Code** | Max subscription | $100-200/month | The CLI tool used to build this app (NOT required for the app to run) | [claude.ai](https://claude.ai) |

**Important distinctions:**
- **Claude Code Max** (your CLI subscription) and **Anthropic API credits** (what the app uses) are completely separate. You need both — Claude Code to develop, API credits for the app to call Claude at runtime.
- **Viber Out** is just one way to test calling. Any phone that can dial international numbers works. Viber Out is convenient if your carrier doesn't support international calls or charges high rates.
- **Twilio trial** works for testing but blocks inbound calls from unverified numbers. Upgrading (free, credit carries over) removes this restriction so anyone can call.

**Total cost to get started testing: ~$5** (Anthropic API top-up; everything else is free tier or included credits)

---

## Production Deployment

For production, replace ngrok with a real server:

| Step | Action |
|------|--------|
| 1 | Deploy to Railway, Render, or AWS (needs WebSocket support — not Vercel) |
| 2 | Set Twilio webhook to your production URL |
| 3 | Add authentication (NextAuth.js / Clerk) |
| 4 | Add Twilio webhook signature validation |
| 5 | Add rate limiting on webhook endpoints |
| 6 | Configure proper SSL and domain |

### Future Enhancements

- **ConversationRelay** — Upgrade from Gather/Say to Twilio's real-time streaming for natural, overlapping conversation
- **Voice cloning** — Custom AI voices per business (ElevenLabs / Sesame CSM)
- **WhatsApp integration** — Same AI agent over WhatsApp (Twilio Messaging)
- **CRM integrations** — Push leads to Salesforce, HubSpot, etc.
- **Call recording** — Store and replay with Twilio Recording
- **Multi-language** — Per-business language config (already has `language` field in schema)

---

## License

Private — not open source.
