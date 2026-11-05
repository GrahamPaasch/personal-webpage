import { createHash } from 'node:crypto';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { readTimeline, updateTimeline } from '@/lib/exercise/store';
import { apply, linksFor, schedule, todayIn, type Action } from '@/lib/exercise/timeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/exercise backs the /exercise timeline (voice-ui spec 31).
 * GET is public. POST needs the shared password ("Graham Exercise", either
 * order, any case or spacing), sent as `password` in the JSON body or an
 * `x-exercise-password` header.
 */
const ACCEPTED = new Set([
  '29ef88f1d1ff5734fbfe8287cad7bc15ac9aa1b4441424bd7d0feb6f04a93eda',
  'ecef5e181b265df3f4e6d6362515f9f4e2d2d23c8b7c6cd83c4c5f2b44683761',
]);
const normalize = (pw: string) => pw.toLowerCase().replace(/[^a-z]/g, '');
const accepted = (pw: unknown) =>
  typeof pw === 'string' && ACCEPTED.has(createHash('sha256').update(`exercise:${normalize(pw)}`).digest('hex'));

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...extra } });

function view(data: Awaited<ReturnType<typeof readTimeline>>, today: string) {
  return { today, sessions: schedule(data, today).map((s) => ({ ...s, links: linksFor(s) })), later: data.later };
}

const dayParam = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayIn());

export async function GET(req: Request) {
  try {
    const today = dayParam(new URL(req.url).searchParams.get('today'));
    return json(view(await readTimeline(), today));
  } catch (e) {
    console.error('exercise GET', e);
    return json({ error: 'storage unavailable' }, 500);
  }
}

const ACTIONS = new Set(['done', 'undo', 'note', 'reset', 'check']);

export async function POST(req: Request) {
  const rl = rateLimit(req, { id: 'exercise:write', limit: 30, windowMs: 60_000 });
  if (!rl.ok) return json({ error: 'too many requests' }, 429, rateLimitHeaders(rl));

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  if (!accepted(body.password ?? req.headers.get('x-exercise-password'))) {
    return json({ error: 'wrong password' }, 401);
  }
  if (typeof body.action !== 'string' || !ACTIONS.has(body.action)) {
    return json({ error: 'action must be done, undo, note, reset or check' }, 400);
  }
  const today = dayParam(body.today);
  if (body.action === 'check') return json({ ok: true });

  try {
    const { data, result } = await updateTimeline((d) => apply(d, body as unknown as Action, today));
    if ('error' in result) return json({ error: result.error }, 400);
    return json({ ok: true, id: result.id ?? null, ...view(data, today) });
  } catch (e) {
    console.error('exercise POST', e);
    return json({ error: 'storage unavailable' }, 500);
  }
}
