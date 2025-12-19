import { NextRequest, NextResponse } from 'next/server';
import { deleteProgress, listProgress, upsertProgress } from '@/lib/patternpals/storage';
import type { PatternStatus } from '@/lib/patternpals/types';

export const runtime = 'nodejs';

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
  const data = await request.json().catch(() => null);
  if (!data || typeof data.jugglerId !== 'string' || typeof data.patternId !== 'string') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }
  if (!isStatus(data.status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const entry = await upsertProgress({
    jugglerId: data.jugglerId,
    patternId: data.patternId,
    status: data.status,
  });
  return NextResponse.json(entry, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const data = await request.json().catch(() => null);
  if (!data || typeof data.jugglerId !== 'string' || typeof data.patternId !== 'string') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  await deleteProgress(data.jugglerId, data.patternId);
  return NextResponse.json({ ok: true });
}
