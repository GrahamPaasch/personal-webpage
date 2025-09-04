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
  const meta: PostMeta = {
    title: data.title ?? slug,
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
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

