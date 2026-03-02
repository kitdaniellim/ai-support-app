import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ─── GET /api/calls?businessId=&limit=&offset= ───────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('businessId');
  const limit      = Math.min(parseInt(searchParams.get('limit')  || '20', 10), 100);
  const offset     = parseInt(searchParams.get('offset') || '0', 10);
  const status     = searchParams.get('status') ?? undefined;

  if (!businessId) {
    return NextResponse.json({ error: 'businessId is required.' }, { status: 400 });
  }

  try {
    const [calls, total] = await prisma.$transaction([
      prisma.call.findMany({
        where:   { businessId, ...(status ? { status: status as any } : {}) },
        orderBy: { startedAt: 'desc' },
        take:    limit,
        skip:    offset,
        include: {
          _count: { select: { messages: true, actionItems: true } },
        },
      }),
      prisma.call.count({ where: { businessId } }),
    ]);

    return NextResponse.json({ calls, total, limit, offset });
  } catch (error) {
    console.error('[api/calls] Database error:', error);
    return NextResponse.json(
      { calls: [], total: 0, limit, offset, error: 'Database temporarily unavailable' },
      { status: 503 },
    );
  }
}
