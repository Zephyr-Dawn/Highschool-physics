import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pwa',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    channel: 'chrome',
    headless: true,
    baseURL: 'http://127.0.0.1:4174',
  },
  webServer: {
    command: 'npm run preview -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
