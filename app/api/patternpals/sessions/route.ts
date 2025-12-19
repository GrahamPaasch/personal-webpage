import { NextRequest, NextResponse } from 'next/server';
import { createSession, listSessions, updateSession } from '@/lib/patternpals/storage';
import type { SessionStatus } from '@/lib/patternpals/types';

export const runtime = 'nodejs';

const STATUSES: SessionStatus[] = ['scheduled', 'completed', 'canceled'];

const isStatus = (value: any): value is SessionStatus => STATUSES.includes(value);

export async function GET(request: NextRequest) {
  const hostId = request.nextUrl.searchParams.get('hostId');
  if (!hostId) {
    return NextResponse.json({ error: 'hostId is required.' }, { status: 400 });
  }
  const items = await listSessions(hostId);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => null);
  if (!data || typeof data.hostId !== 'string' || typeof data.scheduledFor !== 'string') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const scheduled = new Date(data.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduledFor date.' }, { status: 400 });
  }

  const focusPatterns = Array.isArray(data.focusPatterns)
    ? data.focusPatterns.filter((id: any) => typeof id === 'string')
    : [];

  const status: SessionStatus = isStatus(data.status) ? data.status : 'scheduled';

  const entry = await createSession({
    hostId: data.hostId,
    partnerId: typeof data.partnerId === 'string' ? data.partnerId : null,
    partnerName: typeof data.partnerName === 'string' ? data.partnerName : null,
    scheduledFor: scheduled.toISOString(),
    durationMinutes:
      typeof data.durationMinutes === 'number' && Number.isFinite(data.durationMinutes)
        ? Math.round(data.durationMinutes)
        : null,
    location: typeof data.location === 'string' ? data.location.trim() : null,
    focusPatterns,
    status,
    outcome: typeof data.outcome === 'string' ? data.outcome.trim() : null,
  });

  return NextResponse.json(entry, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const data = await request.json().catch(() => null);
  if (!data || typeof data.id !== 'string') {
    return NextResponse.json({ error: 'Session id is required.' }, { status: 400 });
  }

  const updates = {
    partnerId: typeof data.partnerId === 'string' ? data.partnerId : undefined,
    partnerName: typeof data.partnerName === 'string' ? data.partnerName : undefined,
    scheduledFor: typeof data.scheduledFor === 'string' ? data.scheduledFor : undefined,
    durationMinutes:
      typeof data.durationMinutes === 'number' && Number.isFinite(data.durationMinutes)
        ? Math.round(data.durationMinutes)
        : undefined,
    location: typeof data.location === 'string' ? data.location.trim() : undefined,
    focusPatterns: Array.isArray(data.focusPatterns)
      ? data.focusPatterns.filter((id: any) => typeof id === 'string')
      : undefined,
    status: isStatus(data.status) ? data.status : undefined,
    outcome: typeof data.outcome === 'string' ? data.outcome.trim() : undefined,
  };

  const updated = await updateSession(data.id, updates);
  if (!updated) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }
  return NextResponse.json(updated);
}
