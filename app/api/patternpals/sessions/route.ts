import { NextRequest } from 'next/server';
import { createSession, listSessions, updateSession } from '@/lib/patternpals/storage';
import type { SessionStatus } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { patternPalsApiError, patternPalsJson } from '../_utils';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 40_000; // bytes (best-effort)

const STATUSES: SessionStatus[] = ['scheduled', 'completed', 'canceled'];

const isStatus = (value: any): value is SessionStatus => STATUSES.includes(value);

export async function GET(request: NextRequest) {
  const hostId = request.nextUrl.searchParams.get('hostId');
  if (!hostId) {
    return patternPalsJson({ error: 'hostId is required.' }, { status: 400 });
  }

  try {
    const items = await listSessions(hostId);
    return patternPalsJson({ items });
  } catch (error) {
    return patternPalsApiError(error, 'sessions.GET');
  }
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:sessions:write', limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return patternPalsJson(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return patternPalsJson(
      { error: 'Payload too large.' },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const data = await request.json().catch(() => null);
  if (!data || typeof data.hostId !== 'string' || typeof data.scheduledFor !== 'string') {
    return patternPalsJson({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const scheduled = new Date(data.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) {
    return patternPalsJson({ error: 'Invalid scheduledFor date.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const focusPatterns = Array.isArray(data.focusPatterns)
    ? data.focusPatterns.filter((id: any) => typeof id === 'string')
    : [];

  const status: SessionStatus = isStatus(data.status) ? data.status : 'scheduled';

  try {
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

    return patternPalsJson(entry, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'sessions.POST');
  }
}

export async function PATCH(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:sessions:write', limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return patternPalsJson(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return patternPalsJson(
      { error: 'Payload too large.' },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const data = await request.json().catch(() => null);
  if (!data || typeof data.id !== 'string') {
    return patternPalsJson({ error: 'Session id is required.' }, { status: 400, headers: rateLimitHeaders(rl) });
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

  try {
    const updated = await updateSession(data.id, updates);
    if (!updated) {
      return patternPalsJson({ error: 'Session not found.' }, { status: 404, headers: rateLimitHeaders(rl) });
    }
    return patternPalsJson(updated, { headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'sessions.PATCH');
  }
}
