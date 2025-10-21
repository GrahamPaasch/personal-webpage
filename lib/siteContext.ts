import fs from 'fs/promises';
import path from 'path';

type Options = { k?: number; perExcerptChars?: number };

type Item = { slug: string; title: string; excerpt: string };

export async function searchSiteContext(query: string, opts: Options = {}) {
  const k = opts.k ?? 3;
  const per = opts.perExcerptChars ?? 700;
  const dir = path.join(process.cwd(), 'content', 'writings');
  let items: Item[] = [];
  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const slug = file.replace(/\.md$/, '');
      const p = path.join(dir, file);
      const raw = await fs.readFile(p, 'utf-8');
      const titleMatch = /^#\s+(.+)$/m.exec(raw);
      const title = titleMatch ? titleMatch[1].trim() : slug;
      // crude relevance: prefers files containing any query word
      const q = (query || '').toLowerCase();
      const score = q && raw.toLowerCase().includes(q) ? 2 : 1;
      const excerpt = raw.slice(0, per).trim();
      items.push({ slug, title: `${title}`, excerpt: `${excerpt}` + (raw.length > per ? '…' : '') });
      // attach score by duplicating if matched (simple bias)
      if (score > 1) items.push({ slug, title, excerpt });
    }
  } catch {
    items = [];
  }
  // take top-k
  const picked = items.slice(0, k);
  const contextBlocks = picked.map((it, i) => {
    const sanitized = sanitizeExcerpt(it.excerpt);
    return [
      `SOURCE_${i + 1}`,
      `Title: ${it.title}`,
      `URL: /writings/${it.slug}`,
      sanitized ? `Excerpt: ${sanitized}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  });
  const context = contextBlocks.join('\n\n');
  const displayLines = picked.map((it, i) => {
    const snippet = truncateForDisplay(it.excerpt);
    const suffix = snippet ? ` — ${snippet}` : '';
    return `[${i + 1}] ${it.title} (/writings/${it.slug})${suffix}`;
  });
  const display = displayLines.length ? displayLines.join('\n') : '';
  return { items: picked, context, display };
}

function sanitizeExcerpt(raw: string) {
  return raw
    .replace(/^---[\s\S]*?---/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateForDisplay(raw: string, limit = 140) {
  const clean = sanitizeExcerpt(raw);
  if (!clean) return '';
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trim()}…`;
}
