// ─────────────────────────────────────────────────────────────────────────────
//  Claude AI Agent
//  Handles conversational turns, action item analysis, and post-call summaries.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, buildActionItemPrompt, buildSummaryPrompt } from './prompt-builder';
import { sessionManager } from '../session-manager';
import type { Business, ContextProfile } from '@prisma/client';
import type { LeadCriteria } from '../../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONVERSATION_MODEL = process.env.CLAUDE_CONVERSATION_MODEL || 'claude-sonnet-4-6';
const FAST_MODEL         = process.env.CLAUDE_FAST_MODEL         || 'claude-haiku-4-5-20251001';

export interface AIAgentConfig {
  business: Business;
  profile: ContextProfile;
  callerNumber: string;
  callerName?: string;
}

// ─── Conversational Turn ─────────────────────────────────────────────────────

/**
 * Given the latest caller utterance, generate the AI agent's next response.
 * Updates session history and triggers async action-item analysis.
 */
export async function getAIResponse(
  callSid: string,
  userMessage: string,
  config: AIAgentConfig,
): Promise<string> {
  const session = sessionManager.getSessionByCallSid(callSid);
  if (!session) throw new Error(`No session found for callSid: ${callSid}`);

  // Build the dynamic system prompt for this tenant
  const systemPrompt = buildSystemPrompt({
    business: config.business,
    profile:  config.profile,
    callerNumber: config.callerNumber,
    callerName:   config.callerName,
  });

  // Add user utterance to history before sending
  sessionManager.addMessage(callSid, 'user', userMessage);

  // Re-fetch session after mutation
  const updatedSession = sessionManager.getSessionByCallSid(callSid)!;

  const messages = updatedSession.conversationHistory.map((m) => ({
    role:    m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const response = await client.messages.create({
    model:      CONVERSATION_MODEL,
    max_tokens: 150, // Voice: 1–2 sentences max, speed is critical
    system:     systemPrompt,
    messages,
  });

  const aiText =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Log AI response to session
  sessionManager.addMessage(callSid, 'assistant', aiText);

  // Fire-and-forget: analyze for live action items
  analyzeForActionItems(callSid, config).catch((err) =>
    console.error('[ai-agent] action item analysis error:', err),
  );

  return aiText;
}

// ─── Live Action Item Analysis ────────────────────────────────────────────────

async function analyzeForActionItems(callSid: string, config: AIAgentConfig): Promise<void> {
  const session = sessionManager.getSessionByCallSid(callSid);
  // Need at least 4 turns (2 exchanges) before useful analysis
  if (!session || session.conversationHistory.length < 4) return;

  const transcript = session.conversationHistory
    .map((m) => `${m.role === 'user' ? 'Caller' : 'AI Agent'}: ${m.content}`)
    .join('\n');

  const prompt = buildActionItemPrompt(
    transcript,
    `${config.business.name}: ${config.profile.companyDescription}`,
  );

  const response = await client.messages.create({
    model:      FAST_MODEL,
    max_tokens: 400,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]';

  let actionItems: Array<{ suggestion: string; priority: string; category: string }> = [];
  try {
    actionItems = JSON.parse(raw);
  } catch {
    return; // Malformed JSON — skip silently
  }

  if (Array.isArray(actionItems) && actionItems.length > 0) {
    sessionManager.emit('session:action_items', {
      businessId:  session.businessId,
      sessionId:   session.sessionId,
      callSid,
      actionItems,
    });
  }
}

// ─── Post-Call Summary ────────────────────────────────────────────────────────

interface CallSummaryResult {
  summary:      string;
  sentiment:    string;
  leadScore:    number;
  leadQualified: boolean;
  nextAction:   string;
}

export async function generateCallSummary(
  callSid: string,
  businessName: string,
  leadCriteria: LeadCriteria,
): Promise<CallSummaryResult | null> {
  const session = sessionManager.getSessionByCallSid(callSid);
  if (!session || session.conversationHistory.length === 0) return null;

  const transcript = session.conversationHistory
    .map((m) => `${m.role === 'user' ? 'Caller' : 'Agent'}: ${m.content}`)
    .join('\n');

  const prompt = buildSummaryPrompt(transcript, businessName, leadCriteria);

  try {
    const response = await client.messages.create({
      model:      FAST_MODEL,
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}';
    return JSON.parse(raw) as CallSummaryResult;
  } catch {
    return null;
  }
}

