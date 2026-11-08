import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /parents2026 is a private planning page for Graham's parents' December 2026
 * Austin visit, behind a deliberately simple shared password ("grandparents" or
 * "Graham parents", any case or spacing). The HTML lives in private/ so it is
 * never served as a static file; only this route reads it.
 */
const COOKIE = 'parents2026_pw';
const ACCEPTED = new Set([
  'a9fece020b8cc5084435b0a308ea7318958e2157fbadeded51559530533a1ef1',
  '569ebbb89181469108853603031e9fa37abc3b60ce917c24c11ebb7d72a55c69',
]);

const normalize = (pw: string) => pw.toLowerCase().replace(/[^a-z]/g, '');
const accepted = (pw: string | undefined) =>
  !!pw && ACCEPTED.has(createHash('sha256').update(`parents2026:${normalize(pw)}`).digest('hex'));

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function form(wrong: boolean) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Mom &amp; Dad in Austin</title>
<link rel="icon" href="/icon.svg">
<style>body{font-family:system-ui,sans-serif;background:#f6f4ef;color:#222;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;padding:28px;border-radius:12px;box-shadow:0 2px 12px #0001;display:grid;gap:12px;width:min(320px,90vw)}
input,button{font-size:17px;padding:10px;border-radius:8px;border:1px solid #bbb}button{background:#1f4e79;color:#fff;border:0;cursor:pointer}
.err{color:#b00020;margin:0}</style></head><body>
<form method="post" action="/parents2026"><h1 style="margin:0;font-size:22px">Mom &amp; Dad in Austin</h1>
<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" autofocus>
${wrong ? '<p class="err">That\'s not it. Try again.</p>' : ''}<button type="submit">Open</button></form></body></html>`;
}

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });

export async function GET(req: Request) {
  const cookie = req.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
  if (!accepted(cookie && decodeURIComponent(cookie))) return html(form(false));
  return html(readFileSync(path.join(process.cwd(), 'private/parents2026/index.html'), 'utf8'));
}

export async function POST(req: Request) {
  const pw = String((await req.formData()).get('password') ?? '');
  if (!accepted(pw)) return html(form(true), 401);
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/parents2026',
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(normalize(pw))}; Path=/parents2026; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
      ...NO_STORE,
    },
  });
}
