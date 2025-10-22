import { NextRequest, NextResponse } from 'next/server';
import { addComment, listComments } from '@/lib/storage';

export const runtime = 'nodejs';

const MAX_BODY = 1000;
const MAX_AUTHOR = 60;

export async function GET(request: NextRequest) {
  const page = request.nextUrl.searchParams.get('page');
  if (!page) {
    return NextResponse.json({ error: 'Missing page parameter' }, { status: 400 });
  }
  const items = await listComments(page);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => null);
  if (!data || typeof data.page !== 'string' || typeof data.body !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const page = data.page.trim();
  const body = data.body.trim();
  const author = typeof data.author === 'string' ? data.author.trim() : '';

  if (!page || !body) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: 'Comment too long' }, { status: 400 });
  }
  if (author.length > MAX_AUTHOR) {
    return NextResponse.json({ error: 'Name too long' }, { status: 400 });
  }

  const saved = await addComment(page, body, author || null);
  return NextResponse.json(saved, { status: 201 });
}
