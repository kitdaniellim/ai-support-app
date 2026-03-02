'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  Live Call Mirror — Hero Call Experience
//
//  Fills the viewport center. Idle → waiting animation. Active → dramatic
//  waveform, status indicator, and live transcript. The waveform uses a
//  synthetic amplitude generator since Gather/Say doesn't provide real-time
//  audio data (unlike WebSocket media streams).
//
//  Call Phase State Machine:
//    idle → greeting → listening ↔ processing ↔ ai-speaking → (ended) → idle
//
//  Phase transitions:
//    call:started      → greeting (AI greeting plays)
//    ~4s timeout       → listening (greeting done, waiting for caller)
//    transcript(user)  → processing (Claude is thinking)
//    transcript(asst)  → ai-speaking (TTS playing)
//    ~TTS duration     → listening (waiting for next utterance)
//    call:ended        → idle
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import { Waveform } from './Waveform';
import { Transcript } from './Transcript';
import type { TranscriptMessage } from './Transcript';

type CallPhase = 'idle' | 'greeting' | 'listening' | 'processing' | 'ai-speaking';

interface CallSession {
  sessionId: string;
  callSid: string;
  businessId: string;
  callerNumber: string;
  status: 'connecting' | 'active' | 'ended';
  startedAt: string;
}

interface LiveCallMirrorProps {
  businessId: string;
  businessPhone?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Estimate TTS duration: ~130ms per word at normal Polly speaking rate */
function estimateTtsDuration(text: string): number {
  return Math.max(2000, text.split(/\s+/).length * 130);
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

const PHASE_LABEL: Record<CallPhase, string> = {
  idle:          'Waiting for calls...',
  greeting:      'AI is greeting the caller...',
  listening:     'Listening...',
  processing:    'Thinking...',
  'ai-speaking': 'AI is speaking...',
};

const PHASE_COLOR: Record<CallPhase, string> = {
  idle:          'text-slate-500',
  greeting:      'text-emerald-400',
  listening:     'text-cyan-400',
  processing:    'text-blue-400',
  'ai-speaking': 'text-emerald-400',
};

/** Waveform base hue per phase: emerald for AI, cyan for listening, blue for processing */
const PHASE_HUE: Record<CallPhase, number> = {
  idle:          220,
  greeting:      160,
  listening:     185,
  processing:    225,
  'ai-speaking': 160,
};

/** Synthetic amplitude intensity per phase */
const PHASE_INTENSITY: Record<CallPhase, number> = {
  idle:          0,
  greeting:      0.55,
  listening:     0.18,
  processing:    0.10,
  'ai-speaking': 0.6,
};

// ─── Component ───────────────────────────────────────────────────────────────

export function LiveCallMirror({ businessId, businessPhone }: LiveCallMirrorProps) {
  const [connected,  setConnected]  = useState(false);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [phase,      setPhase]      = useState<CallPhase>('idle');
  const [amplitude,  setAmplitude]  = useState(0);
  const [elapsed,    setElapsed]    = useState(0);

  const socketRef     = useRef<Socket | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgCounter    = useRef(0);
  const rafRef        = useRef(0);

  // ── Duration timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeCall) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeCall]);

  // ── Synthetic amplitude generator ──────────────────────────────────────────
  //
  //  Combines three sine waves at different frequencies for organic variation.
  //  Intensity is scaled by the current call phase so the waveform visually
  //  reflects who's "speaking" — even though we don't have real audio data.

  useEffect(() => {
    if (phase === 'idle') {
      setAmplitude(0);
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const animate = () => {
      const t = Date.now() / 1000;
      const intensity = PHASE_INTENSITY[phase];

      // Three overlapping sine waves create natural-looking variation
      const slow   = Math.sin(t * 2.3) * 0.30 + 0.50;
      const medium = Math.sin(t * 6.7) * 0.15;
      const fast   = Math.sin(t * 14)  * 0.05;

      const synthetic = Math.max(0, Math.min(1, (slow + medium + fast) * intensity));
      setAmplitude(synthetic);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe:business', businessId);
    });

    socket.on('disconnect', () => setConnected(false));

    // If a call was already in progress when the dashboard loaded
    socket.on('active:sessions', (sessions: CallSession[]) => {
      if (sessions[0]) {
        setActiveCall(sessions[0]);
        setPhase('listening');
      }
    });

    // ── Call started ─────────────────────────────────────────────────────────
    socket.on('call:started', (session: CallSession) => {
      setTranscript([]);
      setActiveCall(session);
      setPhase('greeting');

      // Transition: greeting → listening after ~4s (greeting TTS finishes)
      if (phaseTimeout.current) clearTimeout(phaseTimeout.current);
      phaseTimeout.current = setTimeout(() => setPhase('listening'), 4000);
    });

    // ── New transcript message ───────────────────────────────────────────────
    socket.on('call:transcript', ({ message }: {
      sessionId: string;
      message: { role: 'user' | 'assistant'; content: string; timestamp: string };
    }) => {
      const newMsg: TranscriptMessage = {
        id:        `m-${++msgCounter.current}`,
        role:      message.role,
        content:   message.content,
        timestamp: new Date(message.timestamp),
      };
      setTranscript((prev) => [...prev, newMsg]);

      // ── Phase transitions based on who spoke ───────────────────────────────
      if (phaseTimeout.current) clearTimeout(phaseTimeout.current);

      if (message.role === 'user') {
        // Caller finished speaking → Claude is processing
        setPhase('processing');
      } else {
        // AI response arrived → TTS is playing
        setPhase('ai-speaking');
        // After estimated TTS duration → back to listening
        const duration = estimateTtsDuration(message.content);
        phaseTimeout.current = setTimeout(() => setPhase('listening'), duration);
      }
    });

    // ── Call ended ───────────────────────────────────────────────────────────
    socket.on('call:ended', () => {
      setPhase('idle');
      setTimeout(() => {
        setActiveCall(null);
        setAmplitude(0);
        setTranscript([]);
      }, 600);
    });

    return () => {
      socket.disconnect();
      if (phaseTimeout.current) clearTimeout(phaseTimeout.current);
    };
  }, [businessId]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`flex-1 flex flex-col relative px-6 ${
      activeCall ? 'pt-4' : 'items-center justify-center'
    }`}>
      {!activeCall ? (
        // ═══════════════════════════════════════════════════════════════════════
        //  IDLE STATE — centered mic icon + gentle waveform
        // ═══════════════════════════════════════════════════════════════════════
        <div className="flex flex-col items-center gap-5 -mt-6 w-full max-w-2xl">
          {/* Mic circle with pulse ring */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-slate-800/80 border border-slate-700/40 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="absolute inset-0 rounded-full border border-cyan-500/10 animate-ping" style={{ animationDuration: '3s' }} />
          </div>

          <div className="text-center">
            <h2 className="text-base font-medium text-slate-300 mb-1">Waiting for calls</h2>
            <p className="text-sm text-slate-600">Your AI agent is live and ready</p>
          </div>

          {/* Subtle idle waveform */}
          <div className="w-full opacity-25">
            <Waveform amplitude={0} isActive={false} bars={48} height={72} />
          </div>

          {businessPhone && (
            <p className="text-[11px] text-slate-700 font-mono tracking-wide">
              Call {businessPhone} to test
            </p>
          )}
        </div>
      ) : (
        // ═══════════════════════════════════════════════════════════════════════
        //  ACTIVE CALL — hero waveform + status + transcript
        // ═══════════════════════════════════════════════════════════════════════
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-3 flex-1 min-h-0 pb-4">
          {/* ── Call header ─────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* LIVE badge */}
              <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/25 rounded-full px-2.5 py-0.5">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-50" />
                </div>
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
              </div>
              <span className="text-sm text-slate-400 font-mono">{activeCall.callerNumber}</span>
            </div>
            <span className="text-cyan-400 font-mono text-lg font-bold tracking-wider">
              {fmtTime(elapsed)}
            </span>
          </div>

          {/* ── Phase indicator ─────────────────────────────────────────────── */}
          <div className="text-center py-1">
            <span className={`text-sm font-medium transition-colors duration-300 ${PHASE_COLOR[phase]}`}>
              {PHASE_LABEL[phase]}
            </span>
          </div>

          {/* ── Hero waveform ──────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800/40 overflow-hidden">
            <Waveform
              amplitude={amplitude}
              isActive={phase !== 'idle'}
              bars={64}
              height={120}
              hue={PHASE_HUE[phase]}
            />
          </div>

          {/* ── Transcript ─────────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/30 overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 px-4 py-2 border-b border-slate-800/30 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest">Transcript</span>
            </div>
            <Transcript messages={transcript} />
          </div>
        </div>
      )}
    </div>
  );
}
