/**
 * Clerk Authentication Middleware
 *
 * SIMPLIFIED: Explicitly declares public routes to avoid auth loops
 * on /sign-in and /sign-up while keeping the rest protected.
 *
 * Test Mode: When E2E_TEST_MODE is set, middleware is bypassed entirely.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const isE2EMode = process.env.E2E_TEST_MODE === 'true';

// Public routes must be explicitly defined to avoid auth loops on /sign-in and /sign-up
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

// In E2E test mode, bypass all auth
function testMiddleware(request: NextRequest) {
  // Warn in server logs if E2E bypass is active on a non-localhost origin
  const host = request.headers.get('host') || '';
  if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
    console.warn(
      `[SECURITY WARNING] E2E_TEST_MODE=true but request is from non-localhost host: ${host}. ` +
      'Authentication is BYPASSED. Set E2E_TEST_MODE=false in production.'
    );
  }
  return NextResponse.next();
}

// Use explicit public routes to avoid sign-in/sign-up interception or redirect loops
export default isE2EMode
  ? testMiddleware
  : clerkMiddleware(async (auth, request) => {
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
