import { NextRequest } from 'next/server';
import { normalizeDomain, saveCrawlerOptIn } from '@/lib/a2aCrawlerIntake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  let body: IntakeRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const validation = validate(body);
  if (!validation.ok) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Thanks! We recorded your opt-in request.',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

