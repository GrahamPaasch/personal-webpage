import { listPostSlugs } from '@/lib/posts';

export default async function sitemap() {
  const base = 'https://www.grahampaasch.com';
  const now = new Date().toISOString();
  const staticPages = ['', '/hobbies', '/professional', '/writings', '/career-vision', '/agent', '/agent/for-agents'].map((p) => ({
    url: base + p,
    lastModified: now,
  }));
  const posts = listPostSlugs().map((slug) => ({
    url: `${base}/writings/${slug}`,
    lastModified: now,
  }));
  return [...staticPages, ...posts];
}
