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
import { PUBLIC_ROUTE_MATCHERS } from './lib/public-routes';

const isE2EMode = process.env.E2E_TEST_MODE === 'true';
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

// Public routes — Clerk skips auth enforcement (and may skip token verification)
// NOTE: '/' is intentionally excluded so that auth() in page.tsx returns the userId
// for signed-in users. The root page handles unauthenticated users itself (shows landing page).
const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTE_MATCHERS]);

// In E2E mode without Clerk secrets, bypass Clerk middleware entirely.
const e2eBypassMiddleware = () => NextResponse.next();

export default isE2EMode && !hasClerkSecret
  ? e2eBypassMiddleware
  : clerkMiddleware(async (auth, request) => {

      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    });

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and API proxy routes (/v1/* → Express API has its own auth)
    '/((?!_next|v1/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
