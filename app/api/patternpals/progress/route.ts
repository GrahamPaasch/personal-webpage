import { NextRequest } from 'next/server';
import { deleteProgress, listProgress, upsertProgress } from '@/lib/patternpals/storage';
import { getPatternById } from '@/lib/patternpals/patterns';
import type { PatternStatus } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { patternPalsApiError, patternPalsJson } from '../_utils';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 20_000; // bytes (best-effort)

const STATUSES: PatternStatus[] = ['known', 'working', 'curious'];

const isStatus = (value: any): value is PatternStatus => STATUSES.includes(value);

export async function GET(request: NextRequest) {
  const jugglerId = request.nextUrl.searchParams.get('jugglerId');
  if (!jugglerId) {
    return patternPalsJson({ error: 'jugglerId is required.' }, { status: 400 });
  }

  try {
    const items = await listProgress(jugglerId);
    return patternPalsJson({ items });
  } catch (error) {
    return patternPalsApiError(error, 'progress.GET');
  }
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:progress:write', limit: 120, windowMs: 60_000 });
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
  if (!data || typeof data.jugglerId !== 'string' || typeof data.patternId !== 'string') {
    return patternPalsJson({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }
  if (!isStatus(data.status)) {
    return patternPalsJson({ error: 'Invalid status.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }
  if (!getPatternById(data.patternId)) {
    return patternPalsJson({ error: 'Invalid patternId.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  try {
    const entry = await upsertProgress({
      jugglerId: data.jugglerId,
      patternId: data.patternId,
      status: data.status,
    });
    return patternPalsJson(entry, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'progress.POST');
  }
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:progress:write', limit: 120, windowMs: 60_000 });
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
  if (!data || typeof data.jugglerId !== 'string' || typeof data.patternId !== 'string') {
    return patternPalsJson({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }
  if (!getPatternById(data.patternId)) {
    return patternPalsJson({ error: 'Invalid patternId.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  try {
    await deleteProgress(data.jugglerId, data.patternId);
    return patternPalsJson({ ok: true }, { headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'progress.DELETE');
  }
}
