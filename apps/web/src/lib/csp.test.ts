/**
 * CSP Configuration Regression Test
 *
 * Validates that the Content-Security-Policy in next.config.js
 * allows all required external domains for Clerk authentication.
 *
 * Note: CSP is disabled in development to prevent Clerk CAPTCHA issues.
 * This test runs with NODE_ENV=production to test production CSP.
 *
 * Reference: https://clerk.com/docs/guides/secure/best-practices/csp-headers
 * Reference: https://developers.cloudflare.com/turnstile/reference/content-security-policy/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';

describe('CSP configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    // Set to production to test CSP headers
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should allow all Clerk and Turnstile domains', async () => {
    // Clear require cache to reload config with production env
    const configPath = path.resolve(__dirname, '../../next.config.js');
    delete require.cache[require.resolve(configPath)];

    // Load the next.config.js and extract headers
    const config = require(configPath);
    const headersResult = await config.headers();

    const catchAllHeaders = headersResult.find(
      (h: any) => h.source === '/:path*'
    );
    expect(catchAllHeaders).toBeDefined();

    const cspHeader = catchAllHeaders.headers.find(
      (h: any) => h.key === 'Content-Security-Policy'
    );
    expect(cspHeader).toBeDefined();

    const csp = cspHeader.value as string;

    // === script-src ===
    // Clerk JS (dev environment)
    expect(csp).toMatch(/script-src[^;]*\*\.clerk\.accounts\.dev/);
    // Clerk JS (production environment)
    expect(csp).toMatch(/script-src[^;]*\*\.clerk\.com/);
    // Cloudflare Turnstile CAPTCHA scripts
    expect(csp).toMatch(/script-src[^;]*challenges\.cloudflare\.com/);

    // === frame-src ===
    // Clerk iframes (dev environment)
    expect(csp).toMatch(/frame-src[^;]*\*\.clerk\.accounts\.dev/);
    // Clerk iframes (production environment)
    expect(csp).toMatch(/frame-src[^;]*\*\.clerk\.com/);
    // Turnstile CAPTCHA iframe
    expect(csp).toMatch(/frame-src[^;]*challenges\.cloudflare\.com/);

    // === connect-src ===
    // Clerk API (dev) - FAPI hostname required for API calls
    expect(csp).toMatch(/connect-src[^;]*\*\.clerk\.accounts\.dev/);
    // Clerk API (production)
    expect(csp).toMatch(/connect-src[^;]*\*\.clerk\.com/);
    // Clerk telemetry
    expect(csp).toMatch(/connect-src[^;]*clerk-telemetry\.com/);
    // General HTTPS for external API calls
    expect(csp).toMatch(/connect-src[^;]*https:/);

    // === worker-src ===
    // Turnstile web workers require blob:
    expect(csp).toMatch(/worker-src[^;]*blob:/);

    // === img-src ===
    // Clerk images
    expect(csp).toMatch(/img-src[^;]*img\.clerk\.com/);

    // === style-src ===
    // Clerk requires unsafe-inline for CSS-in-JS
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
  });
});
