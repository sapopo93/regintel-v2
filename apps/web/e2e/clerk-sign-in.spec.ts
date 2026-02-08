import { test, expect } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.PORT || '4000'}`;
const isE2EMode = process.env.E2E_TEST_MODE === 'true';

test.describe('Clerk sign-in page', () => {
  // Clerk-specific tests require real Clerk integration; skip in E2E test mode
  // where ClerkProvider is absent and middleware bypasses Clerk.
  test.skip(() => isE2EMode, 'Clerk not active in E2E test mode');

  test('CSP headers allow Clerk script and frame sources', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/sign-in`);
    const csp = response.headers()['content-security-policy'] ?? '';

    // Clerk loads its JS from *.clerk.accounts.dev
    expect(csp).toContain('script-src');
    expect(csp).toMatch(/script-src[^;]*clerk\.accounts\.dev/);

    // Cloudflare Turnstile (Clerk CAPTCHA) scripts
    expect(csp).toMatch(/script-src[^;]*challenges\.cloudflare\.com/);

    // Clerk renders auth UI inside iframes from *.clerk.accounts.dev
    expect(csp).toMatch(/frame-src[^;]*clerk\.accounts\.dev/);

    // Turnstile CAPTCHA iframe
    expect(csp).toMatch(/frame-src[^;]*challenges\.cloudflare\.com/);
  });

  test('sign-in page renders without runtime errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`${BASE_URL}/sign-in`);

    // Wait for Clerk to attempt initialization
    await page.waitForTimeout(3000);

    // No ClerkRuntimeError about failed script loading
    const clerkLoadErrors = errors.filter((e) =>
      e.includes('Failed to load Clerk') || e.includes('failed to load script')
    );
    expect(clerkLoadErrors).toHaveLength(0);
  });

  test('root page redirects to /sign-in', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForURL(/\/sign-in/);
    expect(page.url()).toContain('/sign-in');
  });
});
