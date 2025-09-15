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
  const lines = picked.map((it, i) => `[${i + 1}] ${it.title} (/writings/${it.slug})\n${it.excerpt}`);
  const text = picked.length ? `Sources:\n\n${lines.join('\n\n')}` : '';
  return { items: picked, text };
}

