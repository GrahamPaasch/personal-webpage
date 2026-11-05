import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { readBooks, updateBooks } from '@/lib/books/store';
import {
  addNote,
  advancePlace,
  deleteNote,
  logView,
  markFinished,
  movePlace,
  parseAddr,
  passwordOk,
  privateView,
  publicView,
  validSlug,
  withDefaults,
  type Place,
} from '@/lib/books/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /api/books backs the /books reader (voice-ui spec 32).
 *
 * GET is public: places, notes/highlights/links and monthly totals — never a
 * timestamp. With the password (header `x-books-password`) it also returns the
 * private session log, what's on screen, and idle time.
 *
 * POST needs the shared password ("Graham Books", either order, any case or
 * spacing) as `password` in the JSON body or the `x-books-password` header.
 * Actions: check | private | progress | move-place | note | delete-note.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...extra } });

export async function GET(req: Request) {
  try {
    const d = withDefaults(await readBooks());
    const now = Date.now();
    const pw = req.headers.get('x-books-password');
    if (pw != null) {
      if (!passwordOk(pw)) return json({ error: 'wrong password' }, 401);
      return json(privateView(d, now));
    }
    return json(publicView(d, now));
  } catch (e) {
    console.error('books GET', e);
    return json({ error: 'storage unavailable' }, 500);
  }
}

const ACTIONS = new Set(['check', 'private', 'progress', 'move-place', 'note', 'delete-note']);

function place(v: unknown): Place | null {
  const a = parseAddr(v);
  if (!a) return null;
  const i = v && typeof v === 'object' ? (v as Record<string, unknown>).i : undefined;
  return Number.isInteger(i) && (i as number) >= 0 ? { ...a, i: i as number } : a;
}

export async function POST(req: Request) {
  const rl = rateLimit(req, { id: 'books:write', limit: 120, windowMs: 60_000 });
  if (!rl.ok) return json({ error: 'too many requests' }, 429, rateLimitHeaders(rl));

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }
  if (!passwordOk(body.password ?? req.headers.get('x-books-password'))) return json({ error: 'wrong password' }, 401);
  const action = body.action;
  if (typeof action !== 'string' || !ACTIONS.has(action)) {
    return json({ error: `action must be one of ${[...ACTIONS].join(', ')}` }, 400);
  }
  if (action === 'check') return json({ ok: true });
  if (action !== 'private' && !validSlug(body.slug)) return json({ error: 'slug required' }, 400);
  const slug = body.slug as string;

  try {
    const now = Date.now();
    if (action === 'private') return json(privateView(withDefaults(await readBooks()), now));

    const { data, result } = await updateBooks((raw) => {
      const d = withDefaults(raw);
      Object.assign(raw, d);
      switch (action) {
        case 'progress': {
          const paras = (Array.isArray(body.view) ? body.view : []).slice(0, 60).map(parseAddr).filter(Boolean) as { c: number; p: number }[];
          if (paras.length) logView(d, slug, paras, now);
          else d.last = slug;
          const p = place(body.place);
          const moved = p ? advancePlace(d, slug, p, now, Number(body.words) || 0) : false;
          if (body.finished === true) markFinished(d, slug, now);
          return { moved };
        }
        case 'move-place': {
          const p = place(body.place);
          if (!p) return { error: 'place must be "chapter:paragraph"' };
          movePlace(d, slug, p, now);
          d.last = slug;
          return { moved: true };
        }
        case 'note':
          return addNote(d, slug, body, now);
        case 'delete-note':
          return deleteNote(d, slug, body.id) ? { deleted: true } : { error: 'no such note' };
      }
      return { error: 'unknown action' };
    });
    if (result && 'error' in result) return json({ error: result.error }, 400);
    return json({ ok: true, ...result, ...publicView(withDefaults(data), now) });
  } catch (e) {
    console.error('books POST', e);
    return json({ error: 'storage unavailable' }, 500);
  }
}
