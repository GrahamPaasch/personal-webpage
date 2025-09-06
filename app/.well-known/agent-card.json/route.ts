import { NextRequest } from 'next/server';
import { getA2AServer } from '@/app/api/a2a/_server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Root well-known path, but our service endpoint stays at /api/a2a
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || req.nextUrl.origin;
  const baseUrl = `${origin}/api/a2a`;
  const { handler } = getA2AServer(baseUrl);
  const card = await handler.getAgentCard();
  return new Response(JSON.stringify(card), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

