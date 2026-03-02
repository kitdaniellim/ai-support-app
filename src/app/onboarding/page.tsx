'use client';

// ─────────────────────────────────────────────────────────────────────────────
//  Onboarding Flow — 4-step wizard to configure an AI Agent for a business
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ServiceEntry { name: string; description: string }
interface FaqEntry     { question: string; answer: string }
interface LeadCriteria { required: string[]; disqualifiers: string[] }

interface FormData {
  name:               string;
  phoneNumber:        string;
  companyDescription: string;
  services:           ServiceEntry[];
  faqItems:           FaqEntry[];
  toneOfVoice:        string;
  voiceName:          string;
  language:           string;
  greetingScript:     string;
  customInstructions: string;
  leadCriteria:       LeadCriteria;
}

const STEPS = ['Business Info', 'Services & FAQ', 'AI Persona', 'Lead Criteria'];

const TONES = [
  { value: 'PROFESSIONAL', label: 'Professional', desc: 'Polished and competent' },
  { value: 'FRIENDLY',     label: 'Friendly',     desc: 'Warm and conversational' },
  { value: 'FORMAL',       label: 'Formal',       desc: 'Business-appropriate, structured' },
  { value: 'CASUAL',       label: 'Casual',       desc: 'Relaxed, everyday language' },
  { value: 'EMPATHETIC',   label: 'Empathetic',   desc: 'Validating and patient' },
];

const VOICES = [
  { value: 'alloy',   label: 'Alloy',   desc: 'Balanced, neutral tone' },
  { value: 'echo',    label: 'Echo',    desc: 'Warm, resonant male voice' },
  { value: 'fable',   label: 'Fable',   desc: 'Bright, energetic voice' },
  { value: 'onyx',    label: 'Onyx',    desc: 'Deep, authoritative male voice' },
  { value: 'nova',    label: 'Nova',    desc: 'Warm, pleasant mid-range' },
  { value: 'shimmer', label: 'Shimmer', desc: 'Bright, crystalline voice' },
];

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'es-MX', label: 'Spanish (Mexico)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja-JP', label: 'Japanese' },
];

export default function OnboardingPage() {
  const router      = useRouter();
  const [step, setStep]           = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [hasExistingBusiness, setHasExistingBusiness] = useState(false);

  useEffect(() => {
    setHasExistingBusiness(!!localStorage.getItem('businessId'));
  }, []);

  const [form, setForm] = useState<FormData>({
    name:               'Acme Consulting Group',
    phoneNumber:        '+14155550199',
    companyDescription: 'We are a technology consulting firm specializing in AI integration and digital transformation for small to mid-size businesses. We help companies automate customer support, streamline operations, and leverage data-driven insights.',
    services:           [
      { name: 'AI Integration', description: 'Custom AI agent setup for customer support and sales' },
      { name: 'Digital Transformation', description: 'End-to-end modernization of business processes and tools' },
    ],
    faqItems:           [
      { question: 'What are your business hours?', answer: 'Our team is available Monday to Friday, 9 AM to 6 PM EST. Our AI agent handles calls 24/7.' },
      { question: 'How much does a consultation cost?', answer: 'Initial consultations are free. Project pricing starts at $2,500 depending on scope.' },
    ],
    toneOfVoice:        'PROFESSIONAL',
    voiceName:          'onyx',
    language:           'en-US',
    greetingScript:     'Thank you for calling Acme Consulting Group! My name is Alex, your AI assistant. How can I help you today?',
    customInstructions: 'Always mention our free initial consultation offer. If the caller asks about pricing for enterprise plans, offer to schedule a call with a senior consultant. Never discuss competitor services.',
    leadCriteria: {
      required:      ['Full name', 'Email or phone number', 'Service of interest', 'Budget range', 'Timeline'],
      disqualifiers: ['Outside service area', 'Budget far below minimum pricing'],
    },
  });

  const set = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/businesses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed. Please try again.');
      localStorage.setItem('businessId', data.id);
      router.push('/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">

        {/* Back to Dashboard */}
        {hasExistingBusiness && (
          <Link href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-6 group">
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-500/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Configure Your AI Agent</h1>
          <p className="text-slate-400 text-sm mt-1">4 quick steps to launch your 24/7 voice representative</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-1.5 flex-1">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 text-xs transition-colors
                  ${i <= step ? 'text-cyan-400' : 'text-slate-600'}
                  ${i < step ? 'cursor-pointer hover:text-cyan-300' : 'cursor-default'}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all flex-shrink-0
                  ${i < step  ? 'bg-cyan-500 border-cyan-500 text-white' :
                    i === step ? 'border-cyan-500 text-cyan-400' :
                    'border-slate-700 text-slate-600'}`}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className="hidden sm:block font-medium">{label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px ${i < step ? 'bg-cyan-600' : 'bg-slate-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-6">
              {error}
            </div>
          )}

          {/* ── Step 0: Business Info ─────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-white">Business Information</h2>
              <Field label="Business Name" required
                tooltip="This name is used in your AI agent's greeting and throughout the dashboard. Use your official business name as you'd want it spoken to callers.">
                <Input value={form.name} onChange={(v) => set('name', v)} placeholder="Acme Consulting Group" />
              </Field>
              <Field label="Business Phone Number" required
                hint="Your existing business number in international format (e.g. +14155551234)"
                tooltip="Enter your business's real phone number — the one your customers already know. This is used for caller ID and record-keeping. Incoming calls are handled through our platform's telephony system, so you don't need to purchase or configure any special number.">
                <Input value={form.phoneNumber} onChange={(v) => set('phoneNumber', v)} placeholder="+14155551234" />
              </Field>
              <Field label="Company Description" required
                hint="2–4 sentences about what you do and who you serve"
                tooltip="This description is injected into your AI agent's system prompt. Be specific — include your industry, target audience, and key value propositions. The more context you give, the better your agent handles caller questions.">
                <Textarea value={form.companyDescription} onChange={(v) => set('companyDescription', v)}
                  placeholder="We are a residential real estate agency specializing in first-time home buyers across the Phoenix metro area…" />
              </Field>
            </div>
          )}

          {/* ── Step 1: Services & FAQ ────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-7">
              <h2 className="text-lg font-semibold text-white">Services & Knowledge Base</h2>

              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <label className="text-sm font-medium text-slate-300">Services Offered</label>
                  <Tooltip text="List each service your business provides. The AI agent uses these to answer caller questions like 'What do you offer?' Be concise — a name and one-sentence description per service." />
                </div>
                {form.services.map((svc, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-xl p-3.5 mb-3 space-y-2.5">
                    <div className="flex gap-2">
                      <Input value={svc.name} onChange={(v) => {
                        const u = [...form.services]; u[i] = { ...u[i]!, name: v }; set('services', u);
                      }} placeholder="Service name" className="flex-1" />
                      {form.services.length > 1 && (
                        <button onClick={() => set('services', form.services.filter((_, j) => j !== i))}
                          className="text-slate-600 hover:text-red-400 text-xl px-1 transition-colors">×</button>
                      )}
                    </div>
                    <Textarea value={svc.description} onChange={(v) => {
                      const u = [...form.services]; u[i] = { ...u[i]!, description: v }; set('services', u);
                    }} placeholder="Brief description of this service" rows={2} />
                  </div>
                ))}
                <AddButton onClick={() => set('services', [...form.services, { name: '', description: '' }])}>
                  + Add service
                </AddButton>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <label className="text-sm font-medium text-slate-300">FAQ Items</label>
                  <Tooltip text="Add common questions your customers ask and the answers you'd want your AI agent to give. These are used as the agent's knowledge base — the more FAQs, the fewer calls need human escalation." />
                </div>
                {form.faqItems.map((faq, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-xl p-3.5 mb-3 space-y-2.5">
                    <div className="flex gap-2">
                      <Input value={faq.question} onChange={(v) => {
                        const u = [...form.faqItems]; u[i] = { ...u[i]!, question: v }; set('faqItems', u);
                      }} placeholder="Question" className="flex-1" />
                      {form.faqItems.length > 1 && (
                        <button onClick={() => set('faqItems', form.faqItems.filter((_, j) => j !== i))}
                          className="text-slate-600 hover:text-red-400 text-xl px-1 transition-colors">×</button>
                      )}
                    </div>
                    <Textarea value={faq.answer} onChange={(v) => {
                      const u = [...form.faqItems]; u[i] = { ...u[i]!, answer: v }; set('faqItems', u);
                    }} placeholder="Answer" rows={2} />
                  </div>
                ))}
                <AddButton onClick={() => set('faqItems', [...form.faqItems, { question: '', answer: '' }])}>
                  + Add FAQ
                </AddButton>
              </div>
            </div>
          )}

          {/* ── Step 2: AI Persona ────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-white">AI Persona</h2>

              <Field label="Tone of Voice"
                tooltip="Controls how your AI agent speaks to callers. 'Professional' works for most B2B, 'Friendly' is great for consumer-facing, and 'Empathetic' suits support-heavy businesses like healthcare or insurance.">
                <div className="grid grid-cols-1 gap-2">
                  {TONES.map((t) => (
                    <label key={t.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${form.toneOfVoice === t.value
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 hover:border-slate-600'}`}
                    >
                      <input type="radio" name="tone" value={t.value} checked={form.toneOfVoice === t.value}
                        onChange={() => set('toneOfVoice', t.value)} className="accent-cyan-500" />
                      <div>
                        <span className="text-sm font-medium text-white">{t.label}</span>
                        <span className="text-xs text-slate-400 ml-2">— {t.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Voice" tooltip="Choose the AI agent's speaking voice. These are Sesame CSM neural voices. Echo and Onyx tend to sound more masculine; Nova and Shimmer more feminine.">
                  <select value={form.voiceName} onChange={(e) => set('voiceName', e.target.value)}
                    className={`${inputCls} cursor-pointer`}>
                    {VOICES.map((v) => (
                      <option key={v.value} value={v.value}>{v.label} — {v.desc}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Language" tooltip="Sets the speech recognition language — Twilio uses this to understand callers. Match this to the primary language your callers speak. This does NOT translate the AI's responses — it controls how Twilio listens.">
                  <select value={form.language} onChange={(e) => set('language', e.target.value)}
                    className={`${inputCls} cursor-pointer`}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Greeting Script" hint="Opening words spoken when a call connects. Leave blank for default."
                tooltip="This is the first thing callers hear when the AI picks up. Keep it under 2 sentences. Include your business name and a prompt like 'How can I help you today?' If left blank, a generic greeting using your business name is generated automatically.">
                <Textarea value={form.greetingScript} onChange={(v) => set('greetingScript', v)}
                  placeholder={`Thank you for calling ${form.name || 'us'}! How can I help you today?`} />
              </Field>

              <Field label="Custom Instructions" hint="Additional rules for your AI agent (e.g. promotions, escalation triggers, restrictions)"
                tooltip="Think of these as direct instructions to your AI agent. Use them to enforce business rules: mention promotions, avoid certain topics, set escalation triggers, or define when to transfer to a human. Each instruction should be a clear, actionable rule.">
                <Textarea value={form.customInstructions} onChange={(v) => set('customInstructions', v)}
                  placeholder="Always mention our summer promotion. Never discuss competitor pricing…" rows={4} />
              </Field>
            </div>
          )}

          {/* ── Step 3: Lead Criteria ─────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-white">Lead Qualification Criteria</h2>
              <p className="text-slate-400 text-sm">
                Define what the AI must collect from every caller to qualify them as a lead.
              </p>

              <Field label="Required Information to Collect"
                tooltip="These are the data points your AI agent will try to gather from every caller. After the call, the agent scores how many of these fields were captured. This drives the lead qualification score shown on your dashboard.">
                {form.leadCriteria.required.map((item, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input value={item} onChange={(v) => {
                      const u = [...form.leadCriteria.required]; u[i] = v;
                      set('leadCriteria', { ...form.leadCriteria, required: u });
                    }} placeholder="e.g. Full name" className="flex-1" />
                    {form.leadCriteria.required.length > 1 && (
                      <button onClick={() => set('leadCriteria', {
                        ...form.leadCriteria,
                        required: form.leadCriteria.required.filter((_, j) => j !== i),
                      })} className="text-slate-600 hover:text-red-400 text-xl px-1 transition-colors">×</button>
                    )}
                  </div>
                ))}
                <AddButton onClick={() => set('leadCriteria', {
                  ...form.leadCriteria,
                  required: [...form.leadCriteria.required, ''],
                })}>+ Add field</AddButton>
              </Field>

              <Field label="Disqualification Signals" hint="Signals that indicate the caller is NOT a good fit"
                tooltip="If a caller mentions any of these signals, the AI agent will mark them as disqualified. This helps you filter out poor-fit leads. Examples: 'Looking for free service only', 'Located outside our delivery area', 'Needs service we don't offer'.">
                {form.leadCriteria.disqualifiers.map((item, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input value={item} onChange={(v) => {
                      const u = [...form.leadCriteria.disqualifiers]; u[i] = v;
                      set('leadCriteria', { ...form.leadCriteria, disqualifiers: u });
                    }} placeholder="e.g. Outside service area" className="flex-1" />
                    {form.leadCriteria.disqualifiers.length > 1 && (
                      <button onClick={() => set('leadCriteria', {
                        ...form.leadCriteria,
                        disqualifiers: form.leadCriteria.disqualifiers.filter((_, j) => j !== i),
                      })} className="text-slate-600 hover:text-red-400 text-xl px-1 transition-colors">×</button>
                    )}
                  </div>
                ))}
                <AddButton onClick={() => set('leadCriteria', {
                  ...form.leadCriteria,
                  disqualifiers: [...form.leadCriteria.disqualifiers, ''],
                })}>+ Add signal</AddButton>
              </Field>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-5">
          <button onClick={() => setStep((s) => s - 1)} disabled={step === 0}
            className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
          >Back</button>

          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 text-white hover:bg-cyan-400 transition-all text-sm font-semibold"
            >Continue</button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all text-sm font-semibold flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Launching…
                </>
              ) : 'Launch AI Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable sub-components ──────────────────────────────────────────────────

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors';

function Input({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} className={`${inputCls} ${className}`} />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className={`${inputCls} resize-none leading-relaxed`} />
  );
}

function Field({ label, required, hint, tooltip, children }: {
  label: string; required?: boolean; hint?: string; tooltip?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-sm font-medium text-slate-300">
          {label} {required && <span className="text-red-400">*</span>}
        </label>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Reposition tooltip if it overflows viewport
  useEffect(() => {
    if (!open || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 16) {
      tooltipRef.current.style.left = 'auto';
      tooltipRef.current.style.right = '0';
    }
    if (rect.left < 16) {
      tooltipRef.current.style.left = '0';
      tooltipRef.current.style.right = 'auto';
    }
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 flex items-center justify-center text-[10px] font-bold transition-colors cursor-help"
        aria-label="More info"
      >
        ?
      </button>
      {open && (
        <div ref={tooltipRef}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 px-3 py-2.5 rounded-lg bg-slate-700 border border-slate-600 text-xs text-slate-200 leading-relaxed shadow-xl shadow-black/30"
        >
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-700 border-r border-b border-slate-600 rotate-45 -mt-1" />
        </div>
      )}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="text-sm text-cyan-500 hover:text-cyan-400 mt-1 transition-colors"
    >{children}</button>
  );
}
