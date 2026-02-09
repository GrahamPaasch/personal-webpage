import { NextRequest, NextResponse } from 'next/server';
import { addGraffiti, clearGraffiti, listGraffiti } from '@/lib/storage';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const MAX_POINTS = 2000;
const MAX_CONTENT_LENGTH = 200_000; // bytes (best-effort; header may be missing)

function isHexColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
  );
}

export async function GET() {
  const items = await listGraffiti();
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { id: 'graffiti:post', limit: 30, windowMs: 60_000 });
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
  if (!data || !Array.isArray(data.points)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  if (data.points.length > MAX_POINTS) {
    return NextResponse.json(
      { error: `Too many points (max ${MAX_POINTS}).` },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const color = isHexColor(data.color) ? data.color.trim() : '#ffffff';
  const size = typeof data.size === 'number' && Number.isFinite(data.size)
    ? Math.max(1, Math.min(40, data.size))
    : 8;

  let last: { x: number; y: number } | null = null;
  const points: Array<{ x: number; y: number }> = [];
  for (const pt of data.points) {
    if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') continue;
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

    // Clamp to a sane range to avoid pathological payloads.
    const x = Math.max(-10_000, Math.min(10_000, Math.round(pt.x)));
    const y = Math.max(-10_000, Math.min(10_000, Math.round(pt.y)));

    if (last && last.x === x && last.y === y) continue;
    points.push({ x, y });
    last = { x, y };
  }

  if (points.length < 2) {
    return NextResponse.json({ error: 'Not enough points' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const tag = await addGraffiti({ color, size, points });
  return NextResponse.json(tag, { status: 201, headers: rateLimitHeaders(rl) });
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { id: 'graffiti:delete', limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const key = request.nextUrl.searchParams.get('key');
  const expected = process.env.GRAFFITI_RESET_KEY;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: rateLimitHeaders(rl) });
  }
  await clearGraffiti();
  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
