const buildTime = new Date().toISOString();
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || '';
const short = commit ? commit.slice(0, 7) : '';
const baseVersion = process.env.npm_package_version || '0.0.0';
const composedVersion = short ? `${baseVersion}+${short}` : baseVersion;

/**
 * Standalone HTML apps living under public/. Next does not resolve directory
 * indexes for static files, so `/foo` and `/foo/` both 404 unless rewritten to
 * the actual `foo/index.html`. Every self-contained app needs an entry here.
 */
const STATIC_APP_DIRS = [
  'breathing',
  'create-now',
  'panelclash',
  'sidewalks-of-rage',
  'wellness',
];

/** Single-page HTML files that should also answer on an extensionless URL. */
const STATIC_APP_PAGES = [
  'wellness/box-breathing',
  'wellness/coherent-breathing',
  'wellness/time-timer',
  'local/tetris',
  'local/chess',
];

// Only the slashless form is needed: with the default `trailingSlash: false`,
// Next 308s `/foo/` to `/foo` before rewrites run.
const staticRewrites = [
  ...STATIC_APP_DIRS.map((dir) => ({ source: `/${dir}`, destination: `/${dir}/index.html` })),
  ...STATIC_APP_PAGES.map((page) => ({ source: `/${page}`, destination: `/${page}.html` })),
];

/**
 * Baseline hardening. Deliberately no Content-Security-Policy: this site embeds
 * Giscus, LiveKit and several sandboxed HTML apps, so a policy tight enough to
 * be worth having needs to be built and verified against those first.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // The only framing this site does is same-origin (e.g. /synthwave embeds
  // /synthwave.html), so denying cross-origin framing costs nothing.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    // Camera/microphone stay enabled for self — /meet and /bg2 need them.
    value: 'geolocation=(), interest-cohort=(), payment=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return staticRewrites;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Content-hashed build output is safe to cache forever.
        source: '/:prefix(sidewalks-of-rage|panelclash)/assets/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Large, rarely-changing source PDFs.
        source: '/patternpals/books/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: composedVersion,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_COMMIT_SHA: commit,
  },
};

export default nextConfig;
