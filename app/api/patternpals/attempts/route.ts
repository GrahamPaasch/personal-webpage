import { NextRequest } from 'next/server';
import { createAttempt, listAttempts } from '@/lib/patternpals/storage';
import type { PracticeAttemptVerdict } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { patternPalsApiError, patternPalsJson } from '../_utils';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 20_000; // bytes (best-effort)

const VERDICTS: PracticeAttemptVerdict[] = ['too-easy', 'good-fit', 'too-hard', 'unsure'];

const isVerdict = (value: any): value is PracticeAttemptVerdict => VERDICTS.includes(value);

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
    .slice(0, 12);
};

export async function GET(request: NextRequest) {
  const hostId = request.nextUrl.searchParams.get('hostId');
  if (!hostId) {
    return patternPalsJson({ error: 'hostId is required.' }, { status: 400 });
  }

  try {
    const items = await listAttempts(hostId);
    return patternPalsJson({ items });
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
  if (!data || typeof data.hostId !== 'string' || typeof data.patternId !== 'string') {
    return patternPalsJson({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }
  if (!isVerdict(data.verdict)) {
    return patternPalsJson({ error: 'Invalid verdict.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  try {
    const entry = await createAttempt({
      hostId: data.hostId,
      patternId: data.patternId,
      sessionId: typeof data.sessionId === 'string' && data.sessionId.trim() ? data.sessionId.trim() : null,
      verdict: data.verdict,
      note: typeof data.note === 'string' ? data.note.trim() || null : null,
      rosterSnapshot: cleanRosterSnapshot(data.rosterSnapshot),
    });

    return patternPalsJson(entry, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'attempts.POST');
  }
}
