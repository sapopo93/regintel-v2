import { defineConfig, devices } from '@playwright/test';

const founderToken = process.env.FOUNDER_TOKEN || 'test-founder-token';
const providerToken = process.env.PROVIDER_TOKEN || 'test-provider-token';

export default defineConfig({
  testDir: './e2e',
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
        NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
        NEXT_PUBLIC_E2E_TEST_MODE: 'true',
        NEXT_PUBLIC_CLERK_TEST_TOKEN: process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN || founderToken,
        E2E_TEST_MODE: 'true', // Bypass Clerk middleware for E2E tests
      },
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      cwd: '../api',
      env: {
        ...process.env,
        CLERK_TEST_TOKEN: founderToken,
        CLERK_TEST_TENANT_ID: 'demo',
        CLERK_TEST_ROLE: 'FOUNDER',
        CLERK_TEST_USER_ID: 'e2e-test-user',
        FOUNDER_TOKEN: founderToken,
        PROVIDER_TOKEN: providerToken,
        E2E_TEST_MODE: 'true',
        BLOB_STORAGE_PATH: '/tmp/regintel-test-blobs', // Use temp dir for tests
      },
    },
  ],
});
