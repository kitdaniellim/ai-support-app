// ─────────────────────────────────────────────────────────────────────────────
//  Shared TwiML + Twilio Helpers
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

/**
 * Wrap a TwiML body in a valid <Response> XML envelope.
 */
export function twiml(body: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${body}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  );
}

/**
 * Build a full audio URL for Twilio <Play> verbs.
 * Checks X-Forwarded-Proto first (works with any reverse proxy / tunnel),
 * then falls back to ngrok hostname detection.
 */
export function audioUrl(req: { headers: { get(name: string): string | null } }, filename: string): string {
  const host  = req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || (host.includes('ngrok') ? 'https' : 'http');
  return `${proto}://${host}/api/audio/${filename}`;
}
