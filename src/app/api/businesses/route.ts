import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ─── POST /api/businesses — Create a new tenant business ─────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json();
  const {
    name,
    phoneNumber,
    companyDescription,
    services,
    faqItems,
    toneOfVoice,
    customTone,
    greetingScript,
    voiceName,
    language,
    customInstructions,
    leadCriteria,
    escalationRules,
  } = body;

  if (!name || !phoneNumber || !companyDescription) {
    return NextResponse.json(
      { error: 'name, phoneNumber, and companyDescription are required.' },
      { status: 400 },
    );
  }

  // Normalise phone number (basic — in prod use libphonenumber-js)
  const phone = phoneNumber.replace(/\s+/g, '');

  const existing = await prisma.business.findUnique({ where: { phoneNumber: phone } });
  if (existing) {
    return NextResponse.json(
      { error: 'This phone number is already registered.' },
      { status: 409 },
    );
  }

  const business = await prisma.business.create({
    data: {
      name,
      phoneNumber: phone,
      contextProfile: {
        create: {
          companyDescription,
          servicesOffered:    services           ?? [],
          faqItems:           faqItems           ?? [],
          toneOfVoice:        toneOfVoice        ?? 'PROFESSIONAL',
          customTone:         customTone         ?? null,
          greetingScript:     greetingScript     ?? null,
          voiceName:          voiceName          ?? 'onyx',
          language:           language           ?? 'en-US',
          customInstructions: customInstructions ?? null,
          leadCriteria:       leadCriteria       ?? { required: [], disqualifiers: [] },
          escalationRules:    escalationRules    ?? null,
        },
      },
    },
    include: { contextProfile: true },
  });

  return NextResponse.json(business, { status: 201 });
}

// ─── GET /api/businesses — List all businesses (admin use) ───────────────────

export async function GET(): Promise<NextResponse> {
  const businesses = await prisma.business.findMany({
    where:   { isActive: true },
    include: { _count: { select: { calls: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(businesses);
}
