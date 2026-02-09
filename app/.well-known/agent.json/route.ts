import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AgentManifest = {
  schemaVersion: number;
  name: string;
  description: string;
  websiteUrl: string;
  docsUrl: string;
  agentCardUrl: string;
  rpcUrl: string;
  updatedAt: string;
};

export async function GET(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || req.nextUrl.origin;

  const manifest: AgentManifest = {
    schemaVersion: 1,
    name: "Graham Paasch's Site Agent",
    description: 'Agent2Agent (A2A) JSON-RPC endpoint for grahampaasch.com.',
    websiteUrl: origin,
    docsUrl: `${origin}/agent/for-agents`,
    agentCardUrl: `${origin}/.well-known/agent-card.json`,
    rpcUrl: `${origin}/api/a2a`,
    updatedAt: process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString(),
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // This changes on deploy; keep it short-lived.
      'Cache-Control': 'public, max-age=300',
    },
  });
}

