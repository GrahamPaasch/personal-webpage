import { NextRequest } from 'next/server';
import { createAttempt, listAttempts } from '@/lib/patternpals/storage';
import { getPatternById } from '@/lib/patternpals/patterns';
import type { PracticeAttemptVerdict } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { patternPalsApiError, patternPalsJson } from '../_utils';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 20_000; // bytes (best-effort)
const MAX_ID_LENGTH = 120;
const MAX_NOTE_LENGTH = 800;
const MAX_ROSTER_SNAPSHOT_JUGGLERS = 24;

const VERDICTS: PracticeAttemptVerdict[] = ['too-easy', 'good-fit', 'too-hard', 'unsure'];

const isVerdict = (value: any): value is PracticeAttemptVerdict => VERDICTS.includes(value);

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ID_LENGTH) return null;
  return normalized;
};

const cleanRosterSnapshot = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        id: typeof row.id === 'string' ? row.id : '',
        name: typeof row.name === 'string' ? row.name.trim() : '',
        comfortableObjects:
          typeof row.comfortableObjects === 'number' && Number.isFinite(row.comfortableObjects)
            ? row.comfortableObjects
            : 3,
        comfortableCount:
          typeof row.comfortableCount === 'number' && Number.isFinite(row.comfortableCount)
            ? Math.round(row.comfortableCount)
            : 4,
        movementComfort:
          row.movementComfort === 'high' || row.movementComfort === 'moderate' || row.movementComfort === 'stationary'
            ? row.movementComfort
            : 'stationary',
      };
    })
    .filter((item) => item && item.id && item.name)
    .slice(0, MAX_ROSTER_SNAPSHOT_JUGGLERS);
};

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:attempts:read', limit: 180, windowMs: 60_000 });
  if (!rl.ok) {
    return patternPalsJson(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const hostId = normalizeId(request.nextUrl.searchParams.get('hostId'));
  if (!hostId) {
    return patternPalsJson({ error: 'hostId is required.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  try {
    const items = await listAttempts(hostId);
    return patternPalsJson({ items }, { headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'attempts.GET');
  }
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:attempts:write', limit: 80, windowMs: 60_000 });
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
  if (!data || typeof data !== 'object') {
    return patternPalsJson({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const hostId = normalizeId((data as Record<string, unknown>).hostId);
  const patternId = normalizeId((data as Record<string, unknown>).patternId);
  if (!hostId || !patternId) {
    return patternPalsJson({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  if (!getPatternById(patternId)) {
    return patternPalsJson({ error: 'Invalid patternId.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  if (!isVerdict((data as Record<string, unknown>).verdict)) {
    return patternPalsJson({ error: 'Invalid verdict.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  try {
    const entry = await createAttempt({
      hostId,
      patternId,
      sessionId: normalizeId((data as Record<string, unknown>).sessionId),
      verdict: (data as Record<string, unknown>).verdict as PracticeAttemptVerdict,
      note:
        typeof (data as Record<string, unknown>).note === 'string'
          ? (((data as Record<string, unknown>).note as string).trim().slice(0, MAX_NOTE_LENGTH) || null)
          : null,
      rosterSnapshot: cleanRosterSnapshot((data as Record<string, unknown>).rosterSnapshot),
    });

    return patternPalsJson(entry, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'attempts.POST');
  }
}
