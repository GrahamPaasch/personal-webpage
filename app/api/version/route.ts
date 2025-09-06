export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const body = {
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || null,
    commit: process.env.NEXT_PUBLIC_COMMIT_SHA || null,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

