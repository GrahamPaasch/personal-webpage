import { NextRequest } from 'next/server';
import { createSession, listSessions, updateSession } from '@/lib/patternpals/storage';
import type { PracticeMode, ReadinessState, SessionReadinessSnapshot, SessionStatus } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { patternPalsApiError, patternPalsJson } from '../_utils';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 40_000; // bytes (best-effort)

const STATUSES: SessionStatus[] = ['scheduled', 'completed', 'canceled'];
const PRACTICE_MODES: PracticeMode[] = ['solo', 'passing'];
const READINESS_STATES: ReadinessState[] = ['ready', 'stretch', 'blocked'];

const isStatus = (value: any): value is SessionStatus => STATUSES.includes(value);
const isPracticeMode = (value: any): value is PracticeMode => PRACTICE_MODES.includes(value);
const isReadinessState = (value: any): value is ReadinessState => READINESS_STATES.includes(value);

const cleanStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];

const cleanReadinessSnapshot = (value: unknown): SessionReadinessSnapshot[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (typeof row.patternId !== 'string' || !isReadinessState(row.readiness)) return null;
      return {
        patternId: row.patternId,
        readiness: row.readiness,
        reasons: cleanStringArray(row.reasons).slice(0, 6),
        participantCount:
          typeof row.participantCount === 'number' && Number.isFinite(row.participantCount)
            ? Math.max(0, Math.round(row.participantCount))
            : 0,
      };
    })
    .filter((item): item is SessionReadinessSnapshot => Boolean(item));
};

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

  const focusPatterns = cleanStringArray(data.focusPatterns);
  const participantIds = cleanStringArray(data.participantIds);
  const participantNames = cleanStringArray(data.participantNames);
  const partnerId = typeof data.partnerId === 'string' ? data.partnerId : null;
  const partnerName = typeof data.partnerName === 'string' ? data.partnerName.trim() : null;

  if (partnerId && !participantIds.includes(partnerId)) {
    participantIds.unshift(partnerId);
  }
  if (partnerName && !participantNames.includes(partnerName)) {
    participantNames.unshift(partnerName);
  }

  const status: SessionStatus = isStatus(data.status) ? data.status : 'scheduled';
  const practiceMode: PracticeMode = isPracticeMode(data.practiceMode)
    ? data.practiceMode
    : participantIds.length > 0 || participantNames.length > 0
      ? 'passing'
      : 'solo';
  const completedAt =
    status === 'completed'
      ? typeof data.completedAt === 'string' && !Number.isNaN(new Date(data.completedAt).getTime())
        ? new Date(data.completedAt).toISOString()
        : new Date().toISOString()
      : null;

  try {
    const entry = await createSession({
      hostId: data.hostId,
      partnerId,
      partnerName,
      participantIds,
      participantNames,
      practiceMode,
      scheduledFor: scheduled.toISOString(),
      durationMinutes:
        typeof data.durationMinutes === 'number' && Number.isFinite(data.durationMinutes)
          ? Math.round(data.durationMinutes)
          : null,
      location: typeof data.location === 'string' ? data.location.trim() : null,
      focusPatterns,
      readinessSnapshot: cleanReadinessSnapshot(data.readinessSnapshot),
      status,
      outcome: typeof data.outcome === 'string' ? data.outcome.trim() : null,
      completedAt,
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

  const patchStatus = isStatus(data.status) ? data.status : undefined;
  const updates = {
    partnerId: typeof data.partnerId === 'string' ? data.partnerId : undefined,
    partnerName: typeof data.partnerName === 'string' ? data.partnerName.trim() : undefined,
    participantIds: Array.isArray(data.participantIds) ? cleanStringArray(data.participantIds) : undefined,
    participantNames: Array.isArray(data.participantNames) ? cleanStringArray(data.participantNames) : undefined,
    practiceMode: isPracticeMode(data.practiceMode) ? data.practiceMode : undefined,
    scheduledFor: typeof data.scheduledFor === 'string' ? data.scheduledFor : undefined,
    durationMinutes:
      typeof data.durationMinutes === 'number' && Number.isFinite(data.durationMinutes)
        ? Math.round(data.durationMinutes)
        : undefined,
    location: typeof data.location === 'string' ? data.location.trim() : undefined,
    focusPatterns: Array.isArray(data.focusPatterns) ? cleanStringArray(data.focusPatterns) : undefined,
    readinessSnapshot: Array.isArray(data.readinessSnapshot)
      ? cleanReadinessSnapshot(data.readinessSnapshot)
      : undefined,
    status: patchStatus,
    outcome: typeof data.outcome === 'string' ? data.outcome.trim() : undefined,
    completedAt:
      typeof data.completedAt === 'string' && !Number.isNaN(new Date(data.completedAt).getTime())
        ? new Date(data.completedAt).toISOString()
        : patchStatus === 'completed'
          ? new Date().toISOString()
          : undefined,
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
