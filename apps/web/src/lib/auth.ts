/**
 * Authentication Library
 *
 * Provides Clerk hooks in production and safe stubs in E2E test mode.
 * When NEXT_PUBLIC_E2E_TEST_MODE=true, ClerkProvider is absent so
 * the real hooks would throw. We return mock values instead.
 */

import {
  useAuth as clerkUseAuth,
  useUser as clerkUseUser,
} from '@clerk/nextjs';

const isE2EMode =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true'
    : process.env.E2E_TEST_MODE === 'true';

export function useAuth() {
  if (isE2EMode) {
    return {
      isLoaded: true,
      isSignedIn: true,
      userId: 'e2e-test-user',
      getToken: async () => process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN || 'test-clerk-token',
      signOut: async () => {},
    };
  }
  return clerkUseAuth();
}

export function useUser() {
  if (isE2EMode) {
    return {
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'e2e-test-user',
        fullName: 'E2E Test User',
        primaryEmailAddress: { emailAddress: 'test@example.com' },
      },
    };
  }
  return clerkUseUser();
}

export type AuthRole = 'FOUNDER' | 'PROVIDER';
