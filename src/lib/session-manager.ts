// ─────────────────────────────────────────────────────────────────────────────
//  Session Manager
//  In-memory store for active call sessions.
//  Emits events consumed by Socket.IO to update dashboards in real-time.
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { CallSession, ConversationMessage } from '../types';

class SessionManager extends EventEmitter {
  /** sessionId → CallSession */
  private sessions = new Map<string, CallSession>();

  /** twilioCallSid → sessionId (fast reverse lookup) */
  private callSidIndex = new Map<string, string>();

  /** businessId → Set<sessionId> */
  private businessIndex = new Map<string, Set<string>>();

  // ─── Create ──────────────────────────────────────────────────────────────

  createSession(data: Omit<CallSession, 'sessionId' | 'startedAt' | 'amplitude' | 'conversationHistory' | 'status'>): CallSession {
    const sessionId = uuidv4();

    const session: CallSession = {
      ...data,
      sessionId,
      status: 'connecting',
      startedAt: new Date(),
      amplitude: 0,
      conversationHistory: [],
    };

    this.sessions.set(sessionId, session);
    this.callSidIndex.set(data.callSid, sessionId);

    if (!this.businessIndex.has(data.businessId)) {
      this.businessIndex.set(data.businessId, new Set());
    }
    this.businessIndex.get(data.businessId)!.add(sessionId);

    this.emit('session:created', session);
    return session;
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  getSessionByCallSid(callSid: string): CallSession | undefined {
    const id = this.callSidIndex.get(callSid);
    return id ? this.sessions.get(id) : undefined;
  }

  getBusinessSessions(businessId: string): CallSession[] {
    const ids = this.businessIndex.get(businessId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.sessions.get(id))
      .filter(Boolean) as CallSession[];
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  updateSession(sessionId: string, updates: Partial<CallSession>): CallSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const updated = { ...session, ...updates };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Called per audio chunk — emits amplitude for real-time waveform updates.
   * Rate: ~50x/sec (one per Twilio media message).
   */
  updateAmplitude(callSid: string, amplitude: number): void {
    const sessionId = this.callSidIndex.get(callSid);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.amplitude = amplitude;
    this.emit('session:amplitude', {
      sessionId,
      businessId: session.businessId,
      amplitude,
    });
  }

  /**
   * Append a message to the conversation history and notify dashboard.
   */
  addMessage(callSid: string, role: 'user' | 'assistant', content: string): void {
    const sessionId = this.callSidIndex.get(callSid);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const msg: ConversationMessage = { role, content, timestamp: new Date() };
    session.conversationHistory.push(msg);

    this.emit('session:message', {
      sessionId,
      businessId: session.businessId,
      message: msg,
    });
  }

  // ─── End ────────────────────────────────────────────────────────────────

  endSession(callSid: string): void {
    const sessionId = this.callSidIndex.get(callSid);
    if (!sessionId) return;
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'ended';
    this.emit('session:ended', session);

    // Retain in memory for 30 seconds to allow final DB writes, then purge
    setTimeout(() => {
      this.sessions.delete(sessionId);
      this.callSidIndex.delete(callSid);
      this.businessIndex.get(session.businessId)?.delete(sessionId);
    }, 30_000);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
//
//  Use the globalThis pattern (same as prisma.ts) to survive Next.js hot-reloads
//  in development. Without this, each recompilation creates a NEW SessionManager
//  instance, losing all in-memory sessions mid-call.

const globalForSession = globalThis as unknown as { sessionManager: SessionManager };

export const sessionManager =
  globalForSession.sessionManager || new SessionManager();

if (process.env.NODE_ENV !== 'production') {
  globalForSession.sessionManager = sessionManager;
}
