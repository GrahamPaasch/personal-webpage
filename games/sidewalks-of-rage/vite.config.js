import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sidewalks-of-rage/',
  build: {
    outDir: '../../public/sidewalks-of-rage/',
    // Split the large Phaser engine into its own long-cacheable vendor chunk so app code
    // changes don't bust the (rarely-changing) engine bundle.
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
    // Phaser alone is ~1.4MB; raise the warning threshold so a legit large vendor chunk
    // doesn't emit a noisy (false-positive) warning on every build.
    chunkSizeWarningLimit: 1600,
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    allowedHosts: true,
  },
});
