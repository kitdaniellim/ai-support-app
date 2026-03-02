'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  Dashboard — Call-focused single-page experience
//
//  Slim nav → hero call monitor (waveform + transcript)
//  The LiveCallMirror fills the viewport and animates when a call is active.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LiveCallMirror } from '@/components/LiveCallMirror';

interface Business {
  id: string;
  name: string;
  phoneNumber: string;
  _count: { calls: number };
}

export default function DashboardPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const businessId = localStorage.getItem('businessId');
    if (!businessId) { window.location.href = '/onboarding'; return; }

    fetch(`/api/businesses/${businessId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Business fetch failed (${r.status})`);
        return r.json();
      })
      .then((biz) => setBusiness(biz))
      .catch((err) => {
        console.error('[dashboard]', err);
        setError('Could not load business. Is the database awake?');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleReset = async () => {
    const businessId = localStorage.getItem('businessId');
    if (businessId) {
      // Delete from DB, then clear local reference
      await fetch(`/api/businesses/${businessId}`, { method: 'DELETE' }).catch(() => {});
      localStorage.removeItem('businessId');
    }
    window.location.href = '/onboarding';
  };

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-600">Waking up database...</span>
        </div>
      </div>
    );
  }

  if (error && !business) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-slate-400 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="shrink-0 border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="font-bold text-sm">VoiceIQ</span>
            {business && (
              <>
                <span className="text-slate-700 text-sm">/</span>
                <span className="text-slate-400 text-sm truncate max-w-[180px]">{business.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-slate-600 font-mono hidden sm:block">
              {business?.phoneNumber}
            </span>
            <Link href="/onboarding" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Settings
            </Link>
            <button
              onClick={handleReset}
              className="text-xs text-red-500/60 hover:text-red-400 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero: Live Call Experience ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-0">
        {business && (
          <LiveCallMirror
            businessId={business.id}
            businessPhone={business.phoneNumber}
          />
        )}
      </main>

    </div>
  );
}
