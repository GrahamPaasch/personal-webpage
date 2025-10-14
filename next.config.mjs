import createMDX from '@next/mdx';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeWrapVoice from './lib/mdx/rehypeWrapVoice.mjs';
import withVoiceFrontmatter from './lib/mdx/withVoiceFrontmatter.mjs';

const buildTime = new Date().toISOString();
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || '';
const short = commit ? commit.slice(0, 7) : '';
const baseVersion = process.env.npm_package_version || '0.0.0';
const composedVersion = short ? `${baseVersion}+${short}` : baseVersion;

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [remarkFrontmatter, withVoiceFrontmatter],
    rehypePlugins: [rehypeWrapVoice],
  },
});

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: composedVersion,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_COMMIT_SHA: commit,
  },
};

export default withMDX(nextConfig);
