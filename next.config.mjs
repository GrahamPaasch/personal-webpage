/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      // keep bundle lean; nothing special yet
    ],
  },
};

export default nextConfig;

