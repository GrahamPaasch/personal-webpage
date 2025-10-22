import fs from 'fs/promises';
import path from 'path';

type Options = { k?: number; perExcerptChars?: number };

type Item = {
  slug: string;
  title: string;
  excerpt: string;
  score: number;
  mtimeMs: number;
};

export async function searchSiteContext(query: string, opts: Options = {}) {
  const k = opts.k ?? 3;
  const per = opts.perExcerptChars ?? 700;
  const dir = path.join(process.cwd(), 'content', 'writings');
  let items: Item[] = [];
  const normalizedQuery = (query || '').toLowerCase();
  const tokens = Array.from(
    new Set(
      normalizedQuery
        .split(/[^a-z0-9]+/i)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  try {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const slug = file.replace(/\.md$/, '');
      const slugLower = slug.toLowerCase();
      const p = path.join(dir, file);
      const raw = await fs.readFile(p, 'utf-8');
      const rawLower = raw.toLowerCase();
      const titleMatch = /^#\s+(.+)$/m.exec(raw);
      const title = titleMatch ? titleMatch[1].trim() : slug;
      const titleLower = title.toLowerCase();
      let score = tokens.length ? 0 : 1;
      let tokenMatches = 0;
      let titleMatches = 0;
      let slugMatches = 0;
      for (const token of tokens) {
        if (rawLower.includes(token)) tokenMatches += 1;
        if (titleLower.includes(token)) titleMatches += 1;
        if (slugLower.includes(token)) slugMatches += 1;
      }
      if (tokenMatches) score += tokenMatches * 5;
      if (titleMatches) score += titleMatches * 3;
      if (slugMatches) score += slugMatches * 2;
      const stat = await fs.stat(p);
      const excerpt = raw.slice(0, per).trim();
      items.push({
        slug,
        title: `${title}`,
        excerpt: `${excerpt}` + (raw.length > per ? '…' : ''),
        score,
        mtimeMs: stat.mtimeMs,
      });
    }
  } catch {
    items = [];
  }
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.mtimeMs - a.mtimeMs;
  });
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
