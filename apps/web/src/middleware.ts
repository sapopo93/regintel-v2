/**
 * Clerk Authentication Middleware
 *
 * SIMPLIFIED: Explicitly declares public routes to avoid auth loops
 * on /sign-in and /sign-up while keeping the rest protected.
 *
 * Test Mode: Keep Clerk middleware active, but skip protection checks.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isE2EMode = process.env.E2E_TEST_MODE === 'true';
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

// Public routes must be explicitly defined to avoid auth loops on /sign-in and /sign-up
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

// In E2E mode without Clerk secrets, bypass Clerk middleware entirely.
const e2eBypassMiddleware = () => NextResponse.next();

export default isE2EMode && !hasClerkSecret
  ? e2eBypassMiddleware
  : clerkMiddleware(async (auth, request) => {
      if (isE2EMode) {
        const host = request.headers.get('host') || '';
        if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
          console.warn(
            `[SECURITY WARNING] E2E_TEST_MODE=true but request is from non-localhost host: ${host}. ` +
              'Authentication is BYPASSED. Set E2E_TEST_MODE=false in production.'
          );
        }
        return;
      }

      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    });

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
