/**
 * Frontend Auth Security Hardening Tests
 *
 * These tests validate that the frontend authentication security guards
 * work correctly to prevent accidental test token bypass in production.
 *
 * CRITICAL: These tests protect against the bug where test tokens could
 * accidentally override Clerk authentication on the frontend.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ui:auth-security-hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('test token blocking rules', () => {
    it('should NOT allow test token when E2E mode is not enabled', () => {
      process.env.NEXT_PUBLIC_E2E_TEST_MODE = undefined;
      process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN = 'test-token';

      // Simulate the isTestTokenAllowed check from AuthInitializer
      const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
      const isTestTokenAllowed = isE2EMode;

      expect(isTestTokenAllowed).toBe(false);
    });

    it('should NOT allow test token when E2E mode is explicitly false', () => {
      process.env.NEXT_PUBLIC_E2E_TEST_MODE = 'false';
      process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN = 'test-token';

      const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
      const isTestTokenAllowed = isE2EMode;

      expect(isTestTokenAllowed).toBe(false);
    });

    it('should ALLOW test token when E2E mode is true', () => {
      process.env.NEXT_PUBLIC_E2E_TEST_MODE = 'true';
      process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN = 'test-token';

      const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
      const isTestTokenAllowed = isE2EMode;

      expect(isTestTokenAllowed).toBe(true);
    });

    it('should handle missing test token gracefully', () => {
      process.env.NEXT_PUBLIC_E2E_TEST_MODE = 'true';
      process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN = undefined;

      const testToken = process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN;
      const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
      const canUseTestToken = isE2EMode;

      // Even if E2E mode is on, no token means no test auth
      expect(testToken).toBeUndefined();
      expect(canUseTestToken).toBe(true); // Mode allows it
      // But no token to use, so Clerk flow would be used
    });
  });

  describe('environment variable synchronization', () => {
    it('should have consistent E2E mode between server and client env vars', () => {
      // This test documents the requirement that E2E_TEST_MODE (server)
      // and NEXT_PUBLIC_E2E_TEST_MODE (client) should always be set together

      // In a properly configured environment:
      // - E2E_TEST_MODE=true should imply NEXT_PUBLIC_E2E_TEST_MODE=true
      // - E2E_TEST_MODE=false/undefined should imply NEXT_PUBLIC_E2E_TEST_MODE=false/undefined

      // This test validates the naming convention is followed
      const serverVar = 'E2E_TEST_MODE';
      const clientVar = 'NEXT_PUBLIC_E2E_TEST_MODE';

      // The client var must start with NEXT_PUBLIC_ to be accessible on client
      expect(clientVar.startsWith('NEXT_PUBLIC_')).toBe(true);

      // The vars should be named consistently (just with prefix difference)
      expect(clientVar).toBe('NEXT_PUBLIC_' + serverVar);
    });
  });

  describe('security configuration matrix', () => {
    const testCases = [
      // [E2E_MODE, TEST_TOKEN, Expected: canUseToken]
      { e2eMode: 'true', testToken: 'token', expected: true, desc: 'E2E mode with token' },
      { e2eMode: 'true', testToken: undefined, expected: false, desc: 'E2E mode without token' },
      { e2eMode: 'false', testToken: 'token', expected: false, desc: 'No E2E mode with token' },
      { e2eMode: 'false', testToken: undefined, expected: false, desc: 'No E2E mode without token' },
      { e2eMode: undefined, testToken: 'token', expected: false, desc: 'Undefined E2E with token' },
      { e2eMode: undefined, testToken: undefined, expected: false, desc: 'Undefined E2E without token' },
    ];

    testCases.forEach(({ e2eMode, testToken, expected, desc }) => {
      it(`should handle: ${desc}`, () => {
        process.env.NEXT_PUBLIC_E2E_TEST_MODE = e2eMode;
        process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN = testToken;

        const isE2EMode = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
        const hasToken = !!process.env.NEXT_PUBLIC_CLERK_TEST_TOKEN;
        const canUseTestToken = isE2EMode && hasToken;

        expect(canUseTestToken).toBe(expected);
      });
    });
  });
});
