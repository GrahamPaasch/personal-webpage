#!/usr/bin/env node
/**
 * Recover writings content from a protected Vercel deployment using a bypass token.
 * Usage:
 *   node scripts/recover_writings.js --base https://your-deployment.vercel.app --token BYPASS_TOKEN
 */

const fsp = require('fs/promises');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--base') out.base = args[++i];
    else if (a === '--token') out.token = args[++i];
  }
  if (!out.base || !out.token) {
    console.error('Usage: node scripts/recover_writings.js --base <url> --token <bypass_token>');
    process.exit(1);
  }
  return out;
}

function withBypass(url, token) {
  const u = new URL(url);
  u.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  u.searchParams.set('x-vercel-protection-bypass', token);
  return u.toString();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'recover-script/1.0' } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) locs.push(m[1]);
  return locs.filter((u) => /\/writings\//.test(u));
}

function extractTitleAndHTML(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1 ? stripTags(h1[1]).trim() : (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'Untitled').trim();
  const article = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (article) return { title, inner: article[1] };
  const main = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (main) return { title, inner: main[1] };
  const body = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
  return { title, inner: body ? body[1] : html };
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '');
}

function htmlToMarkdown(inner) {
  let s = inner;
  s = s.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (m, p1) => '\n```\n' + decodeHTMLEntities(p1) + '\n```\n');
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (m, p1) => '\n# ' + stripTags(p1) + '\n\n');
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (m, p1) => '\n## ' + stripTags(p1) + '\n\n');
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, p1) => '\n### ' + stripTags(p1) + '\n\n');
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (m, p1) => '\n- ' + stripTags(p1));
  s = s.replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, '\n');
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (m, p1) => '\n' + stripTags(p1) + '\n');
  s = s.replace(/<br\s*\/?>(?=\s*<)/gi, '\n');
  s = s.replace(/<br\s*\/?>(?!\n)/gi, '\n');
  s = s.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => `${stripTags(txt)} (${href})`);
  s = stripTags(s);
  s = decodeHTMLEntities(s);
  s = s.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return s;
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function main() {
  const { base, token } = parseArgs();
  const sitemapUrl = withBypass(new URL('/sitemap.xml', base).toString(), token);
  console.log(`[recover] Fetching sitemap: ${sitemapUrl}`);
  const xml = await fetchText(sitemapUrl);
  const urls = extractLocs(xml);
  if (!urls.length) {
    console.error('[recover] No /writings/* URLs found in sitemap');
    process.exit(2);
  }
  const outDir = path.join(process.cwd(), 'content', 'writings');
  await fsp.mkdir(outDir, { recursive: true });
  const saved = [];
  for (const u of urls) {
    try {
      const url = withBypass(u, token);
      console.log(`[recover] Fetching ${url}`);
      const html = await fetchText(url);
      const { title, inner } = extractTitleAndHTML(html);
      const md = `# ${title}\n\n` + htmlToMarkdown(inner);
      const slug = new URL(u).pathname.split('/').filter(Boolean).pop();
      const out = path.join(outDir, `${slug}.md`);
      await fsp.writeFile(out, md, 'utf-8');
      saved.push(out);
    } catch (err) {
      console.error('[recover] Failed', u, err?.message || err);
    }
  }
  console.log(`[recover] Wrote ${saved.length} files:`);
  for (const s of saved) console.log(' -', path.relative(process.cwd(), s));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

