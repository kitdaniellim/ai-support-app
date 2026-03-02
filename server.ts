// ─────────────────────────────────────────────────────────────────────────────
//  Custom Next.js Server
//
//  Runs alongside Next.js to handle:
//  1. Socket.IO  — Real-time dashboard updates (WebSocket to browser)
//
//  Why a custom server?
//  Next.js App Router API routes cannot host persistent WebSocket connections.
//  Socket.IO requires a raw HTTP server for its WebSocket upgrade handshake.
//
//  Note: Twilio voice AI uses the Gather/Say HTTP loop (no WebSocket needed).
// ─────────────────────────────────────────────────────────────────────────────

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';

import { sessionManager } from './src/lib/session-manager';
import { prisma } from './src/lib/prisma';

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app  = next({ dev });
const handle = app.getRequestHandler();

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // ─── 1. Socket.IO — Dashboard Live Feed ────────────────────────────────────

  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    console.log(`[socket.io] Dashboard connected: ${socket.id}`);

    // Business owner subscribes to their business room
    socket.on('subscribe:business', (businessId: string) => {
      socket.join(`business:${businessId}`);
      console.log(`[socket.io] ${socket.id} subscribed to business:${businessId}`);

      // Immediately push any in-progress sessions
      const active = sessionManager.getBusinessSessions(businessId);
      if (active.length > 0) {
        socket.emit('active:sessions', active);
      }
    });

    // Owner dismisses an action item
    socket.on('dismiss:action', async ({ actionId }: { actionId: string }) => {
      await prisma.actionItem.update({
        where: { id: actionId },
        data:  { dismissed: true },
      }).catch(() => {/* not critical */});
    });

    socket.on('disconnect', () => {
      console.log(`[socket.io] Dashboard disconnected: ${socket.id}`);
    });
  });

  // ─── Pipe SessionManager events → Socket.IO rooms ─────────────────────────

  sessionManager.on('session:created', (session) => {
    io.to(`business:${session.businessId}`).emit('call:started', session);
  });

  sessionManager.on('session:message', ({ businessId, sessionId, message }) => {
    io.to(`business:${businessId}`).emit('call:transcript', { sessionId, message });
  });

  // Throttle amplitude to ~20fps to avoid flooding the browser
  let lastAmplitudeTs: Record<string, number> = {};
  sessionManager.on('session:amplitude', ({ businessId, sessionId, amplitude }) => {
    const now = Date.now();
    if (!lastAmplitudeTs[sessionId] || now - lastAmplitudeTs[sessionId]! > 50) {
      io.to(`business:${businessId}`).emit('call:amplitude', { sessionId, amplitude });
      lastAmplitudeTs[sessionId] = now;
    }
  });

  sessionManager.on('session:action_items', ({ businessId, sessionId, callSid, actionItems }) => {
    // Persist to DB, then push to dashboard
    (async () => {
      const call = await prisma.call.findUnique({ where: { twilioCallSid: callSid } });
      if (!call) return;

      const saved = await Promise.all(
        actionItems.map((item: { suggestion: string; priority: string; category?: string }) =>
          prisma.actionItem.create({
            data: {
              callId:     call.id,
              suggestion: item.suggestion,
              priority:   (item.priority?.toUpperCase() || 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
              category:   item.category ?? null,
            },
          }),
        ),
      );

      io.to(`business:${businessId}`).emit('call:action_items', { sessionId, actionItems: saved });
    })().catch((err) => console.error('[session:action_items]', err));
  });

  sessionManager.on('session:ended', (session) => {
    io.to(`business:${session.businessId}`).emit('call:ended', {
      sessionId: session.sessionId,
    });
    // Clean up amplitude throttle map
    delete lastAmplitudeTs[session.sessionId];
  });

  // ─── Start ─────────────────────────────────────────────────────────────────

  httpServer.listen(port, () => {
    console.log(`\n🚀 AI Support App running on http://localhost:${port}`);
    console.log(`   Socket.IO: ws://localhost:${port}/socket.io\n`);
  });
});
