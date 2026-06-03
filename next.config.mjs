const buildTime = new Date().toISOString();
const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || '';
const short = commit ? commit.slice(0, 7) : '';
const baseVersion = process.env.npm_package_version || '0.0.0';
const composedVersion = short ? `${baseVersion}+${short}` : baseVersion;

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/wellness',
        destination: '/wellness/index.html',
      },
      {
        source: '/wellness/',
        destination: '/wellness/index.html',
      },
      {
        source: '/wellness/box-breathing',
        destination: '/wellness/box-breathing.html',
      },
      {
        source: '/wellness/box-breathing/',
        destination: '/wellness/box-breathing.html',
      },
      {
        source: '/wellness/coherent-breathing',
        destination: '/wellness/coherent-breathing.html',
      },
      {
        source: '/wellness/coherent-breathing/',
        destination: '/wellness/coherent-breathing.html',
      },
      { source: '/wellness/time-timer', destination: '/wellness/time-timer.html' },
      { source: '/wellness/time-timer/', destination: '/wellness/time-timer.html' },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: composedVersion,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_COMMIT_SHA: commit,
  },
};

export default nextConfig;
