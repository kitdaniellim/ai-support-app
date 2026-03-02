import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: { id: string };
}

// ─── GET /api/businesses/:id ─────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: params.id },
      include: {
        contextProfile: true,
        _count: { select: { calls: true } },
      },
    });

    if (!business) {
      return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
    }

    return NextResponse.json(business);
  } catch (error) {
    console.error('[api/businesses] Database error:', error);
    return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
  }
}

// ─── PATCH /api/businesses/:id — Update context profile ──────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const body = await req.json();

  const business = await prisma.business.update({
    where: { id: params.id },
    data: {
      name:          body.name          ?? undefined,
      phoneNumber:   body.phoneNumber   ?? undefined,
      contextProfile: body.profile ? {
        update: {
          companyDescription: body.profile.companyDescription ?? undefined,
          servicesOffered:    body.profile.services           ?? undefined,
          faqItems:           body.profile.faqItems           ?? undefined,
          toneOfVoice:        body.profile.toneOfVoice        ?? undefined,
          customTone:         body.profile.customTone         ?? undefined,
          greetingScript:     body.profile.greetingScript     ?? undefined,
          voiceName:          body.profile.voiceName          ?? undefined,
          language:           body.profile.language           ?? undefined,
          customInstructions: body.profile.customInstructions ?? undefined,
          leadCriteria:       body.profile.leadCriteria       ?? undefined,
          escalationRules:    body.profile.escalationRules    ?? undefined,
        },
      } : undefined,
    },
    include: { contextProfile: true },
  });

  return NextResponse.json(business);
}

// ─── DELETE /api/businesses/:id — Remove business and all related data ──────

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    // Cascade deletes handled by Prisma schema (contextProfile, calls→messages, etc.)
    await prisma.business.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
    }
    console.error('[api/businesses] Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete business.' }, { status: 500 });
  }
}
