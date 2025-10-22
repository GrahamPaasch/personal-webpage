import { NextRequest, NextResponse } from 'next/server';
import { addGraffiti, clearGraffiti, listGraffiti } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET() {
  const items = await listGraffiti();
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => null);
  if (!data || !Array.isArray(data.points)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const color = typeof data.color === 'string' ? data.color : '#ffffff';
  const size = typeof data.size === 'number' && Number.isFinite(data.size)
    ? Math.max(1, Math.min(40, data.size))
    : 8;
  const points = data.points
    .filter((pt: any) =>
      pt && typeof pt.x === 'number' && typeof pt.y === 'number' && Number.isFinite(pt.x) && Number.isFinite(pt.y))
    .map((pt: any) => ({ x: Math.round(pt.x), y: Math.round(pt.y) }));

  if (points.length < 2) {
    return NextResponse.json({ error: 'Not enough points' }, { status: 400 });
  }

  const tag = await addGraffiti({ color, size, points });
  return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const expected = process.env.GRAFFITI_RESET_KEY;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await clearGraffiti();
  return NextResponse.json({ ok: true });
}
