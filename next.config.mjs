import pkg from './package.json' assert { type: 'json' };

const buildTime = new Date().toISOString();
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || '';
const short = commit ? commit.slice(0, 7) : '';
const baseVersion = pkg.version || '0.0.0';
const composedVersion = short ? `${baseVersion}+${short}` : baseVersion;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      // keep bundle lean; nothing special yet
    ],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: composedVersion,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_COMMIT_SHA: commit,
  },
};

export default nextConfig;
