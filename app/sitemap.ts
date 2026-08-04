import fs from 'node:fs';
import path from 'node:path';

import { getPost, listPostSlugs } from '@/lib/posts';

const BASE = 'https://www.grahampaasch.com';

/**
 * Routes deliberately kept out of the sitemap: utility endpoints, live-session
 * pages that are meaningless without a room, and demo surfaces.
 */
const EXCLUDED_ROUTES = new Set([
  '/meet', // needs a room + camera permission to be anything
  '/meet/overlay', // opened programmatically from /meet
  '/bg2', // private game-night room
  '/demonstration', // render-heavy demo, not a destination
]);

/**
 * Walks app/ and returns every statically routable page path. Deriving this
 * beats the previous hand-maintained list, which had drifted and was missing
 * ~15 real pages (all of /tools/rationality/*, /workout, /synthwave, ...).
 */
function listAppRoutes(): string[] {
  const appDir = path.join(process.cwd(), 'app');
  const routes: string[] = [];

  const walk = (dir: string, segments: string[]) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((e) => e.isFile() && /^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name))) {
      routes.push(`/${segments.join('/')}`);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // Skip private folders, route groups, parallel/intercepting routes, API
      // handlers, and dynamic segments (those are enumerated separately).
      if (name.startsWith('_') || name.startsWith('.') || name.startsWith('@')) continue;
      if (name.startsWith('(') || name.startsWith('[')) continue;
      if (segments.length === 0 && (name === 'api' || name === 'components')) continue;
      walk(path.join(dir, name), [...segments, name]);
    }
  };

  walk(appDir, []);
  return routes;
}

/** Standalone HTML apps under public/ that have a clean URL via next.config rewrites. */
const STATIC_APP_ROUTES = [
  '/breathing',
  '/create-now',
  '/panelclash',
  '/sidewalks-of-rage',
  '/wellness',
  '/wellness/box-breathing',
  '/wellness/coherent-breathing',
  '/wellness/time-timer',
];

export default async function sitemap() {
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();

  const appRoutes = listAppRoutes()
    .filter((route) => !EXCLUDED_ROUTES.has(route))
    // '/' comes back as '' from the walk above; normalise it.
    .map((route) => (route === '/' ? '' : route));

  const staticPages = [...new Set([...appRoutes, ...STATIC_APP_ROUTES])]
    .sort()
    .map((p) => ({ url: BASE + p, lastModified: buildTime }));

  const posts = listPostSlugs()
    .map((slug) => getPost(slug))
    .filter(Boolean)
    .map((post) => ({
      url: `${BASE}/writings/${post!.meta.slug}`,
      lastModified: post!.meta.date,
    }));

  return [...staticPages, ...posts];
}
