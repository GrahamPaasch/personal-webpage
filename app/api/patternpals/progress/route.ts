import { NextRequest, NextResponse } from 'next/server';
import { deleteProgress, listProgress, upsertProgress } from '@/lib/patternpals/storage';
import type { PatternStatus } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 20_000; // bytes (best-effort)

const STATUSES: PatternStatus[] = ['known', 'working', 'curious'];

const isStatus = (value: any): value is PatternStatus => STATUSES.includes(value);

export async function GET(request: NextRequest) {
  const jugglerId = request.nextUrl.searchParams.get('jugglerId');
  if (!jugglerId) {
    return NextResponse.json({ error: 'jugglerId is required.' }, { status: 400 });
  }
  const items = await listProgress(jugglerId);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:progress:write', limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: 'Payload too large.' },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const data = await request.json().catch(() => null);
  if (!data || typeof data.jugglerId !== 'string' || typeof data.patternId !== 'string') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }
  if (!isStatus(data.status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const entry = await upsertProgress({
    jugglerId: data.jugglerId,
    patternId: data.patternId,
    status: data.status,
  });
  return NextResponse.json(entry, { status: 201, headers: rateLimitHeaders(rl) });
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:progress:write', limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: 'Payload too large.' },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const data = await request.json().catch(() => null);
  if (!data || typeof data.jugglerId !== 'string' || typeof data.patternId !== 'string') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  await deleteProgress(data.jugglerId, data.patternId);
  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
