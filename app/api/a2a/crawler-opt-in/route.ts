import { NextRequest } from 'next/server';
import { normalizeDomain, saveCrawlerOptIn } from '@/lib/a2aCrawlerIntake';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CONTENT_LENGTH = 15_000; // bytes (best-effort)

type IntakeRequest = {
  domain?: string;
  contact?: string;
  message?: string;
};

function validate(body: IntakeRequest) {
  if (!body || typeof body.domain !== 'string') {
    return { ok: false, error: 'Domain is required.' } as const;
  }
  const domain = normalizeDomain(body.domain);
  if (!domain) {
    return { ok: false, error: 'Please provide a valid https:// domain.' } as const;
  }
  const contact = typeof body.contact === 'string' && body.contact.trim() ? body.contact.trim() : undefined;
  if (contact && contact.length > 200) {
    return { ok: false, error: 'Contact is too long (max 200 chars).' } as const;
  }
  const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : undefined;
  if (message && message.length > 2000) {
    return { ok: false, error: 'Message is too long (max 2000 chars).' } as const;
  }
  return { ok: true, payload: { domain, contact, message } } as const;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { id: 'a2a:opt-in', limit: 6, windowMs: 60 * 60_000 });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return new Response(JSON.stringify({ error: 'Payload too large.' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    });
  }

  let body: IntakeRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    });
  }

  const validation = validate(body);
  if (!validation.ok) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    });
  }

  try {
    await saveCrawlerOptIn(validation.payload);
  } catch (err: any) {
    const status = err?.message === 'Invalid domain' ? 400 : 500;
    const message =
      status === 400 ? 'Invalid domain.' : 'Failed to record request.';
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Thanks! We recorded your opt-in request.',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...rateLimitHeaders(rl) },
    }
  );
}

