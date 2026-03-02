import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
      {/* Logo */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-6 shadow-xl shadow-cyan-500/20">
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>

      <h1 className="text-5xl font-bold text-white mb-3">
        Voice<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">IQ</span>
      </h1>
      <p className="text-slate-400 text-lg max-w-md mb-10">
        AI-powered voice agents that qualify leads, answer questions, and
        never miss a call — built for any business.
      </p>

      <div className="flex gap-4">
        <Link
          href="/onboarding"
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20"
        >
          Get Started
        </Link>
        <Link
          href="/dashboard"
          className="px-6 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
        >
          Dashboard
        </Link>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-3 gap-5 mt-20 max-w-3xl w-full text-left">
        {[
          { icon: '🧠', title: 'Claude-Powered',    desc: 'Anthropic Claude answers as YOUR business — trained on your FAQs, services, and tone.' },
          { icon: '📡', title: 'Live Call Mirror',   desc: 'Watch every call unfold in real-time. GSAP waveform, live transcript, and AI coaching.' },
          { icon: '🏢', title: 'Multi-Tenant',       desc: 'Each business gets isolated AI instructions, call logs, and lead qualification rules.' },
        ].map((f) => (
          <div key={f.title} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="text-2xl mb-3">{f.icon}</div>
            <h3 className="font-semibold text-white mb-1.5">{f.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
