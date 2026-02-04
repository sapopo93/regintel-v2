'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { apiClient } from '@/lib/api/client';

/**
 * SECURITY HARDENING: Detect if test token should be allowed.
 *
 * Test tokens should ONLY be used when:
 * 1. NEXT_PUBLIC_E2E_TEST_MODE is explicitly 'true'
 *
 * If someone accidentally sets NEXT_PUBLIC_CLERK_TEST_TOKEN in production
 * without E2E mode, this guard prevents the security bypass.
 */
function isTestTokenAllowed(): boolean {
    const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';

    // Only allow test tokens in explicit E2E test mode
    if (!isE2EMode) {
        return false;
    }

    return true;
}

/**
 * AuthInitializer bridges Clerk authentication with the ApiClient singleton.
 * It injects the Clerk getToken function into the apiClient so that all
 * subsequent API calls include the Clerk JWT.
 *
 * SECURITY: Test tokens are ONLY used when NEXT_PUBLIC_E2E_TEST_MODE=true.
 * This prevents accidental test auth bypass in production if NEXT_PUBLIC_CLERK_TEST_TOKEN
 * is accidentally set without E2E mode enabled.
 *
 * In E2E test mode, this component is not rendered (layout.tsx skips ClerkProvider).
 */
export function AuthInitializer() {
    const { getToken } = useAuth();
    const testToken = process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN;
    const canUseTestToken = isTestTokenAllowed();

    useEffect(() => {
        // SECURITY: Log warning if test token is set but not allowed
        if (testToken && !canUseTestToken) {
            console.error(
                '[AUTH SECURITY ERROR] NEXT_PUBLIC_CLERK_TEST_TOKEN is set but ' +
                'NEXT_PUBLIC_E2E_TEST_MODE is not "true". Test token will be IGNORED ' +
                'to prevent security bypass. Remove the test token or enable E2E mode.'
            );
        }

        // Inject the getToken provider into the global apiClient instance
        apiClient.updateConfig({
            getToken: async () => {
                // SECURITY HARDENING: Only use test token if explicitly allowed
                if (testToken && canUseTestToken) {
                    return testToken;
                }
                try {
                    return await getToken();
                } catch (error) {
                    console.error('Failed to get Clerk token:', error);
                    return null;
                }
            }
        });
    }, [getToken, testToken, canUseTestToken]);

    return null; // This component doesn't render anything
}
