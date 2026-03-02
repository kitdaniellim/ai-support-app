'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  Real-time Scrolling Transcript
//  GSAP animates each new message bubble sliding up into view.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

export interface TranscriptMessage {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: Date;
}

interface TranscriptProps {
  messages: TranscriptMessage[];
}

export function Transcript({ messages }: TranscriptProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const lastBubbleRef  = useRef<HTMLDivElement>(null);
  const prevLengthRef  = useRef(0);

  useEffect(() => {
    if (messages.length <= prevLengthRef.current) return;
    prevLengthRef.current = messages.length;

    // Animate the newest message
    if (lastBubbleRef.current) {
      gsap.fromTo(
        lastBubbleRef.current,
        { opacity: 0, y: 14, scale: 0.97 },
        { opacity: 1, y: 0,  scale: 1,    duration: 0.32, ease: 'power2.out' },
      );
    }

    // Auto-scroll to bottom
    if (containerRef.current) {
      gsap.to(containerRef.current, {
        scrollTop: containerRef.current.scrollHeight,
        duration:  0.35,
        ease:      'power2.inOut',
      });
    }
  }, [messages.length]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-2.5 overflow-y-auto flex-1 min-h-0 px-4 py-3"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
    >
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
          <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <p className="text-sm">Transcript will appear when the call begins…</p>
        </div>
      )}

      {messages.map((msg, i) => {
        const isLast      = i === messages.length - 1;
        const isAssistant = msg.role === 'assistant';

        return (
          <div
            key={msg.id}
            ref={isLast ? lastBubbleRef : null}
            className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`
                relative max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                ${isAssistant
                  ? 'bg-slate-700/80 text-slate-100 rounded-tl-sm'
                  : 'bg-cyan-500/15 text-cyan-50 border border-cyan-500/25 rounded-tr-sm'
                }
              `}
            >
              {/* Role label */}
              <span className={`block text-[10px] font-semibold mb-1 tracking-wide
                ${isAssistant ? 'text-slate-400' : 'text-cyan-400'}`}
              >
                {isAssistant ? 'AI Agent' : 'Caller'}
              </span>

              {/* Message body */}
              <span>{msg.content}</span>

              {/* Timestamp */}
              <span className="block text-[10px] text-slate-500 mt-1.5 text-right">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
