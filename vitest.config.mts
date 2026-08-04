import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the `@/*` path alias from tsconfig.json.
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    // Scoped to tests/unit so Playwright keeps ownership of tests/*.spec.ts.
    // Without this, vitest's default glob would also collect the browser specs.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
