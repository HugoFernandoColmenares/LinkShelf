import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4200',
    locale: 'es-419',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    env: {
      ...process.env,
      FIREBASE_USE_EMULATORS: 'true',
    },
  },
});
