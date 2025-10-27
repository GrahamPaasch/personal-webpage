import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export type PostMeta = {
  title: string;
  date: string; // ISO string
  excerpt?: string;
  slug: string;
};

const POSTS_DIR = path.join(process.cwd(), 'content', 'writings');

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const byNumber = new Date(value);
    return Number.isNaN(byNumber.getTime()) ? null : byNumber.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return null;
}

function findDateInContent(content: string): string | null {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const direct = toIsoDate(trimmed);
    if (direct) return direct;

    const cleaned = trimmed.replace(/^[#>*\-\s]+/, '').trim();
    if (cleaned && cleaned !== trimmed) {
      const cleanedDate = toIsoDate(cleaned);
      if (cleanedDate) return cleanedDate;
    }
  }
  return null;
}

function fileTimestampIso(filePath: string): string {
  const stats = fs.statSync(filePath);
  const hasBirthtime =
    Number.isFinite(stats.birthtimeMs) &&
    stats.birthtimeMs > 0 &&
    stats.birthtime.getFullYear() > 1971;
  const fallbackDate = hasBirthtime ? stats.birthtime : stats.mtime;
  return fallbackDate.toISOString();
}

export function listPostSlugs(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

export function getPost(slug: string): { meta: PostMeta; content: string } | null {
  const file = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  const normalizedDate =
    toIsoDate(data.date) ?? findDateInContent(content) ?? fileTimestampIso(file);
  const meta: PostMeta = {
    title: data.title ?? slug,
    date: normalizedDate,
    excerpt: data.excerpt ?? '',
    slug,
  };
  return { meta, content };
}

export function listPosts(): PostMeta[] {
  return listPostSlugs()
    .map((slug) => getPost(slug)!)
    .filter(Boolean)
    .map((p) => p!.meta)
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}
