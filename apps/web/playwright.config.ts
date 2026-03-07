import { defineConfig, devices } from '@playwright/test';

const founderToken = process.env.FOUNDER_TOKEN || 'test-founder-token';
const providerToken = process.env.PROVIDER_TOKEN || 'test-provider-token';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    acceptDownloads: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
        NEXT_PUBLIC_FOUNDER_TOKEN: process.env.NEXT_PUBLIC_FOUNDER_TOKEN || founderToken,
        NEXT_PUBLIC_PROVIDER_TOKEN: process.env.NEXT_PUBLIC_PROVIDER_TOKEN || providerToken,
        NEXT_PUBLIC_CLERK_TEST_TOKEN: process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN || founderToken,
        NEXT_PUBLIC_E2E_TEST_MODE: 'true',
        E2E_TEST_MODE: 'true', // Bypass Clerk middleware for E2E tests
      },
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      cwd: '../api',
      timeout: 15_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3001',
        FOUNDER_TOKEN: founderToken,
        PROVIDER_TOKEN: providerToken,
        CLERK_TEST_TOKEN: founderToken,
        E2E_TEST_MODE: 'true', // Disable rate limiting for E2E tests
        BLOB_STORAGE_PATH: '/tmp/regintel-test-blobs', // Use temp dir for tests
      },
    },
  ],
});
