import { NextRequest } from 'next/server';
import { getA2AServer } from './_server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// JSON-RPC endpoint (non-streaming and streaming via SSE)
export async function POST(req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || req.nextUrl.origin;
  const baseUrl = `${origin}/api/a2a`;
  const { rpc } = getA2AServer(baseUrl);

  const body = await req.text();
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
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Single JSON response
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

