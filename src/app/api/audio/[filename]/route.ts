// ─────────────────────────────────────────────────────────────────────────────
//  Audio File Server
//
//  Serves generated Sesame CSM audio files so Twilio can <Play> them.
//  Files are stored in tmp/audio/ and served via this route.
//
//  GET /api/audio/{filename}.wav → returns audio/wav
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getAudioFile } from '@/lib/tts/sesame-client';

const MIME_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  ogg: 'audio/ogg',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } },
): Promise<NextResponse> {
  const { filename } = params;

  // Reject path traversal attempts and non-audio filenames
  if (!filename.match(/^[\w\-.]+\.\w+$/) || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const ext = filename.split('.').pop() || 'wav';
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const buffer = getAudioFile(filename);
  if (!buffer) {
    return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-cache',
    },
  });
}
