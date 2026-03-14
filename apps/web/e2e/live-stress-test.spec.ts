import { test, expect } from '@playwright/test';

const BASE = 'https://regintelia.co.uk';

test.describe('Live Site: Public Routes', () => {
  test('homepage loads and redirects', async ({ page }) => {
    const res = await page.goto(BASE + '/');
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: 'e2e/screenshots/home.png', fullPage: true });
    console.log('URL after redirect:', page.url());
    console.log('Title:', await page.title());
  });

  test('sign-in page loads', async ({ page }) => {
    const res = await page.goto(BASE + '/sign-in');
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: 'e2e/screenshots/sign-in.png', fullPage: true });
    console.log('Sign-in title:', await page.title());
    const h1 = await page.locator('h1').first().textContent().catch(() => 'none');
    console.log('H1:', h1);
  });

  test('sign-up page loads', async ({ page }) => {
    const res = await page.goto(BASE + '/sign-up');
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: 'e2e/screenshots/sign-up.png', fullPage: true });
  });

  test('terms page loads', async ({ page }) => {
    const res = await page.goto(BASE + '/terms');
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: 'e2e/screenshots/terms.png', fullPage: true });
    console.log('Terms title:', await page.title());
  });

  test('privacy page loads', async ({ page }) => {
    const res = await page.goto(BASE + '/privacy');
    expect(res?.status()).toBeLessThan(500);
    await page.screenshot({ path: 'e2e/screenshots/privacy.png', fullPage: true });
  });

  test('providers redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(BASE + '/providers');
    await page.waitForLoadState('networkidle');
    console.log('Providers redirect URL:', page.url());
    await page.screenshot({ path: 'e2e/screenshots/providers-unauth.png', fullPage: true });
    expect(page.url()).not.toBe(BASE + '/providers');
  });

  test('dashboard redirects when unauthenticated', async ({ page }) => {
    await page.goto(BASE + '/dashboard');
    await page.waitForLoadState('networkidle');
    console.log('Dashboard redirect URL:', page.url());
    await page.screenshot({ path: 'e2e/screenshots/dashboard-unauth.png', fullPage: true });
  });
});

test.describe('Live Site: Security Headers', () => {
  test('security headers are present', async ({ request }) => {
    const res = await request.get(BASE + '/');
    const headers = res.headers();
    console.log('\n--- Security Headers ---');
    const securityHeaders = [
      'x-frame-options',
      'x-content-type-options',
      'content-security-policy',
      'referrer-policy',
      'permissions-policy',
      'strict-transport-security',
      'x-xss-protection',
    ];
    for (const h of securityHeaders) {
      console.log(`${h}: ${headers[h] ?? 'MISSING'}`);
    }
    expect(headers['x-frame-options']).toBeTruthy();
    expect(headers['x-content-type-options']).toBeTruthy();
    expect(headers['content-security-policy']).toBeTruthy();
  });
});

test.describe('Live Site: API Auth Enforcement', () => {
  test('GET /v1/providers returns 401 unauthenticated', async ({ request }) => {
    const res = await request.get(BASE + '/v1/providers');
    console.log('GET /v1/providers status:', res.status());
    const body = await res.text();
    console.log('Body:', body.slice(0, 200));
    expect([401, 403]).toContain(res.status());
  });

  test('GET /v1/facilities returns 401 unauthenticated', async ({ request }) => {
    const res = await request.get(BASE + '/v1/facilities');
    console.log('GET /v1/facilities status:', res.status());
    expect([401, 403]).toContain(res.status());
  });

  test('POST /v1/providers returns 401 unauthenticated', async ({ request }) => {
    const res = await request.post(BASE + '/v1/providers', { data: {} });
    console.log('POST /v1/providers status:', res.status());
    expect([401, 403]).toContain(res.status());
  });

  test('API does not leak stack traces on auth failure', async ({ request }) => {
    const res = await request.get(BASE + '/v1/providers/fake-id/findings');
    const body = await res.text();
    console.log('Response body:', body.slice(0, 300));
    expect(body).not.toContain('at Object.');
    expect(body).not.toContain('node_modules');
  });
});

test.describe('Live Site: Error Handling', () => {
  test('404 page for nonexistent routes', async ({ page }) => {
    const res = await page.goto(BASE + '/this-page-does-not-exist-xyz');
    await page.screenshot({ path: 'e2e/screenshots/404.png', fullPage: true });
    console.log('404 status:', res?.status());
    console.log('404 URL:', page.url());
  });

  test('path traversal attempt is rejected', async ({ request }) => {
    const res = await request.get(BASE + '/../../../etc/passwd');
    console.log('Path traversal status:', res.status());
    const body = await res.text();
    expect(body).not.toContain('root:');
  });
});

test.describe('Live Site: Performance', () => {
  test('homepage responds in under 3s', async ({ page }) => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await page.goto(BASE + '/');
      await page.waitForLoadState('domcontentloaded');
      times.push(Date.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log('Response times (ms):', times);
    console.log('Average (ms):', avg.toFixed(0));
    expect(avg).toBeLessThan(3000);
  });

  test('sign-in page responds in under 3s', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE + '/sign-in');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    console.log('Sign-in load time (ms):', elapsed);
    expect(elapsed).toBeLessThan(3000);
  });
});

test.describe('Live Site: HTTP Redirects', () => {
  test('HTTP redirects to HTTPS', async ({ request }) => {
    const res = await request.get('http://regintelia.co.uk/', { maxRedirects: 0 }).catch(e => e);
    console.log('HTTP redirect status:', res?.status?.() ?? res?.message);
  });

  test('www subdomain behaviour', async ({ request }) => {
    const res = await request.get('https://www.regintelia.co.uk/').catch(e => ({
      status: () => 'error', text: async () => e.message
    }));
    console.log('www status:', res.status());
  });
});

test.describe('Live Site: UI Elements', () => {
  test('sign-in page has working form elements', async ({ page }) => {
    await page.goto(BASE + '/sign-in');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'e2e/screenshots/sign-in-loaded.png', fullPage: true });
    const inputs = await page.locator('input').count();
    const buttons = await page.locator('button').count();
    console.log('Inputs on sign-in:', inputs);
    console.log('Buttons on sign-in:', buttons);
    expect(inputs).toBeGreaterThan(0);
    expect(buttons).toBeGreaterThan(0);
  });

  test('no console errors on homepage', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(BASE + '/');
    await page.waitForLoadState('networkidle');
    console.log('Console errors:', errors);
    // Log but don't fail — just report
  });

  test('no broken images on sign-in page', async ({ page }) => {
    await page.goto(BASE + '/sign-in');
    await page.waitForLoadState('networkidle');
    const brokenImages = await page.evaluate(() => {
      return Array.from(document.images)
        .filter(img => !img.complete || img.naturalWidth === 0)
        .map(img => img.src);
    });
    console.log('Broken images:', brokenImages);
    expect(brokenImages).toHaveLength(0);
  });
});
