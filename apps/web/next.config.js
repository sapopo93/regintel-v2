/** @type {import('next').NextConfig} */

// SECURITY HARDENING: Environment-aware CSP configuration
// In production, localhost should NOT be in CSP connect-src
const isProduction = process.env.NODE_ENV === 'production';
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

// Clerk CSP domains (per https://clerk.com/docs/guides/secure/best-practices/csp-headers)
// These domains are required for Clerk authentication to function properly
// Set CLERK_DOMAIN env var if using a Clerk custom domain (e.g. clerk.regintelia.co.uk)
const clerkCustomDomain = process.env.CLERK_DOMAIN ? [`https://${process.env.CLERK_DOMAIN}`] : [];

const clerkDomains = {
  // Script sources - Clerk JS SDK and Cloudflare Turnstile CAPTCHA
  scriptSrc: [
    ...clerkCustomDomain,
    'https://*.clerk.accounts.dev',  // Dev Clerk JS
    'https://*.clerk.com',           // Production Clerk JS
    'https://challenges.cloudflare.com', // Turnstile CAPTCHA
    'https://*.challenges.cloudflare.com', // Turnstile CAPTCHA subdomains
  ],
  // Connect sources - Clerk API calls and telemetry
  connectSrc: [
    ...clerkCustomDomain,
    'https://*.clerk.accounts.dev',  // Dev Clerk API (FAPI)
    'https://*.clerk.com',           // Production Clerk API
    'https://clerk-telemetry.com',   // Clerk telemetry
    'https://*.clerk-telemetry.com', // Clerk telemetry subdomains
    'https://api.stripe.com',        // Stripe (for Clerk billing if used)
  ],
  // Frame sources - Clerk UI iframes and Turnstile
  frameSrc: [
    ...clerkCustomDomain,
    'https://*.clerk.accounts.dev',  // Dev Clerk iframes
    'https://*.clerk.com',           // Production Clerk iframes
    'https://challenges.cloudflare.com', // Turnstile CAPTCHA iframe
    'https://*.challenges.cloudflare.com', // Turnstile CAPTCHA subdomains
  ],
  // Image sources
  imgSrc: [
    'https://img.clerk.com',         // Clerk images
  ],
};

// Build connect-src based on environment
// Production: Only allow self, https, and explicit Clerk domains (no localhost)
// Development: Allow self, localhost, and https
const connectSrc = isProduction
  ? `connect-src 'self' https: ${clerkDomains.connectSrc.join(' ')}`
  : `connect-src 'self' ${apiBaseUrl} https: ${clerkDomains.connectSrc.join(' ')}`;

// Log warning if API URL is localhost in production
if (isProduction && apiBaseUrl.includes('localhost')) {
  console.error(
    '[CSP SECURITY WARNING] NEXT_PUBLIC_API_BASE_URL contains localhost in production. ' +
    'This is a security risk. Set it to your production API URL.'
  );
}

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
  // Proxy API calls through Next.js to avoid CORS issues in production.
  // Browser calls /v1/... (same-origin), Next.js forwards to the API server.
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: `${apiBaseUrl}/v1/:path*`,
      },
    ];
  },
  // Security headers - CSP disabled in development to prevent Clerk CAPTCHA issues
  async headers() {
    // Skip CSP in development - Clerk's Turnstile CAPTCHA has strict requirements
    if (!isProduction) {
      return [
        {
          source: '/:path*',
          headers: [
            { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
          ],
        },
      ];
    }

    // Production CSP
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-eval' 'unsafe-inline' ${clerkDomains.scriptSrc.join(' ')}`,
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: https: ${clerkDomains.imgSrc.join(' ')}`,
              "font-src 'self'",
              connectSrc,
              `frame-src 'self' ${clerkDomains.frameSrc.join(' ')}`,
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
