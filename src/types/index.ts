// ─────────────────────────────────────────────────────────────────────────────
//  Shared TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

// ─── Session Manager ──────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface CallSession {
  sessionId: string;
  callSid: string;
  businessId: string;
  callerNumber: string;
  status: 'connecting' | 'active' | 'ended';
  startedAt: Date;
  amplitude: number;
  conversationHistory: ConversationMessage[];
}

// ─── Business Context ─────────────────────────────────────────────────────────

export interface ServiceEntry {
  name: string;
  description: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface LeadCriteria {
  required: string[];
  disqualifiers: string[];
  highQualScore?: string;
  medQualScore?: string;
  lowQualScore?: string;
}

export interface EscalationRules {
  triggers: string[];
  handoffPhrase: string;
}
