export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const body = {
    ok: true,
    service: 'grahampaasch.com a2a agent',
    time: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

