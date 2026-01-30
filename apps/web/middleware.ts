/**
 * Clerk Authentication Middleware
 *
 * Protects all routes except public pages (landing/sign-in/sign-up).
 * Ensures users are authenticated before accessing the application.
 *
 * Test Mode: When CLERK_SECRET_KEY is not set, middleware is bypassed
 * to allow E2E tests to run without Clerk authentication.
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',              // Landing page
  '/sign-in(.*)',   // Clerk sign-in pages
  '/sign-up(.*)',   // Clerk sign-up pages
  '/login(.*)',     // Legacy login page (for testing)
  '/api/webhooks/clerk', // Clerk webhook endpoint
]);

// Check if Clerk is configured and not in E2E test mode
const isClerkEnabled = !!process.env.CLERK_SECRET_KEY && !process.env.E2E_TEST_MODE;

export default isClerkEnabled
  ? clerkMiddleware(async (auth, request) => {
      // Protect all routes except public ones
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    })
  : function testMiddleware(request: NextRequest) {
      // In test/dev mode (no Clerk or E2E_TEST_MODE), allow all routes
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
