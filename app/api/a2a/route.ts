import { NextRequest } from 'next/server';
import { getA2AServer } from './_server';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_CHARS = 50_000;

// JSON-RPC endpoint (non-streaming and streaming via SSE)
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { id: 'a2a:rpc', limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || req.nextUrl.origin;
  const baseUrl = `${origin}/api/a2a`;
  const { rpc } = getA2AServer(baseUrl);

  const body = await req.text();
  if (body.length > MAX_BODY_CHARS) {
    return new Response(JSON.stringify({ error: 'Payload too large.' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    });
  }
  const result = await rpc.handle(body);

  // Streaming: AsyncGenerator produces SSE events
  if (typeof (result as any)?.[Symbol.asyncIterator] === 'function') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of result as AsyncGenerator<any>) {
            const chunk = `id: ${Date.now()}\n` + `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          // End stream on error
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        ...rateLimitHeaders(rl),
      },
    });
  }

  // Single JSON response
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...rateLimitHeaders(rl) },
  });
}

