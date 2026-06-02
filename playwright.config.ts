import { defineConfig } from '@playwright/test';

const shouldStartWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== '1';

export default defineConfig({
  testDir: './tests',
  timeout: 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    contextOptions: {
      reducedMotion: 'reduce',
    },
  },
  webServer: shouldStartWebServer
    ? {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      }
    : undefined,
});
