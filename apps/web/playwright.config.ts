import { defineConfig, devices } from '@playwright/test';

// Ensure E2E env vars are available to test files (not just webServer processes).
// Tests like clerk-sign-in.spec.ts check process.env.E2E_TEST_MODE to decide skipping.
process.env.E2E_TEST_MODE = 'true';
process.env.NEXT_PUBLIC_E2E_TEST_MODE = 'true';

const clerkTestToken = process.env.CLERK_TEST_TOKEN || 'test-clerk-token';

const PORT = process.env.PORT || '4000';
const API_PORT = process.env.API_PORT || '4001';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${PORT}`,
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
      command: `PORT=${PORT} pnpm dev`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || `http://localhost:${API_PORT}`,
        NEXT_PUBLIC_CLERK_TEST_TOKEN: process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN || clerkTestToken,
        E2E_TEST_MODE: 'true',
        NEXT_PUBLIC_E2E_TEST_MODE: 'true',
      },
    },
    {
      command: `PORT=${API_PORT} pnpm dev`,
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      cwd: '../api',
      env: {
        ...process.env,
        ALLOWED_ORIGINS: `http://localhost:${PORT},http://localhost:${API_PORT},http://localhost:3000,http://localhost:3001`,
        CLERK_TEST_TOKEN: clerkTestToken,
        CLERK_TEST_USER_ID: process.env.CLERK_TEST_USER_ID || 'clerk-test-user',
        CLERK_TEST_ROLE: process.env.CLERK_TEST_ROLE || 'FOUNDER',
        CLERK_TEST_TENANT_ID: process.env.CLERK_TEST_TENANT_ID || 'demo',
        E2E_TEST_MODE: 'true',
        BLOB_STORAGE_PATH: '/tmp/regintel-test-blobs',
      },
    },
  ],
});
