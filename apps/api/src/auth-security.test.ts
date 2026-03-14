/**
 * Auth Security Hardening Tests
 *
 * These tests validate that the authentication security guards work correctly
 * to prevent accidental test auth bypass in production-like environments.
 *
 * CRITICAL: These tests protect against the bug where test tokens could
 * accidentally override Clerk authentication in production.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the isTestAuthAllowed logic by mocking environment variables
// Since the function is not exported, we'll test it through resolveAuthContext behavior

describe('auth:security-hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to ensure fresh env reads
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('test auth blocking in production', () => {
    it('should NOT allow test auth when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CLERK_TEST_TOKEN = 'test-token';
      process.env.E2E_TEST_MODE = undefined;

      // Import fresh module with production env
      const { resolveAuthContext } = await import('./auth');

      // Create mock request with test token
      const mockReq = {
        header: vi.fn().mockImplementation((name: string) => {
          if (name === 'authorization') return 'Bearer test-token';
          return undefined;
        }),
        query: {},
      } as any;

      // Test auth should be blocked in production
      const result = await resolveAuthContext(mockReq);
      expect(result).toBeNull();
    });

    it('should NOT allow test auth when CLERK_SECRET_KEY is set without E2E_TEST_MODE', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CLERK_SECRET_KEY = 'sk_test_xxx';
      process.env.CLERK_TEST_TOKEN = 'test-token';
      process.env.E2E_TEST_MODE = undefined;

      // Suppress the expected warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { resolveAuthContext } = await import('./auth');

      const mockReq = {
        header: vi.fn().mockImplementation((name: string) => {
          if (name === 'authorization') return 'Bearer test-token';
          return undefined;
        }),
        query: {},
      } as any;

      const result = await resolveAuthContext(mockReq);

      // Test auth should be blocked when Clerk is configured without E2E mode
      expect(result).toBeNull();

      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('AUTH SECURITY WARNING')
      );

      warnSpy.mockRestore();
    });

    it('should ALLOW test auth when E2E_TEST_MODE=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CLERK_SECRET_KEY = 'sk_test_xxx';
      process.env.CLERK_TEST_TOKEN = 'test-token';
      process.env.CLERK_TEST_TENANT_ID = 'test-tenant';
      process.env.CLERK_TEST_USER_ID = 'test-user';
      process.env.CLERK_TEST_ROLE = 'FOUNDER';
      process.env.E2E_TEST_MODE = 'true';

      const { resolveAuthContext } = await import('./auth');

      const mockReq = {
        header: vi.fn().mockImplementation((name: string) => {
          if (name === 'authorization') return 'Bearer test-token';
          return undefined;
        }),
        query: {},
      } as any;

      const result = await resolveAuthContext(mockReq);

      // Test auth should work when E2E mode is explicitly enabled
      expect(result).not.toBeNull();
      expect(result?.tenantId).toBe('test-tenant');
      expect(result?.role).toBe('FOUNDER');
    });

    it('should ALLOW test auth when NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';
      process.env.CLERK_SECRET_KEY = 'sk_test_xxx';
      process.env.CLERK_TEST_TOKEN = 'test-token';
      process.env.CLERK_TEST_TENANT_ID = 'test-tenant';
      process.env.E2E_TEST_MODE = undefined;

      const { resolveAuthContext } = await import('./auth');

      const mockReq = {
        header: vi.fn().mockImplementation((name: string) => {
          if (name === 'authorization') return 'Bearer test-token';
          return undefined;
        }),
        query: {},
      } as any;

      const result = await resolveAuthContext(mockReq);

      // Test auth should work in test environment
      expect(result).not.toBeNull();
      expect(result?.tenantId).toBe('test-tenant');
    });
  });

  describe('test token validation', () => {
    it('should reject requests with wrong test token even when test auth is allowed', async () => {
      process.env.NODE_ENV = 'test';
      process.env.CLERK_TEST_TOKEN = 'correct-token';
      process.env.CLERK_SECRET_KEY = undefined;

      const { resolveAuthContext } = await import('./auth');

      const mockReq = {
        header: vi.fn().mockImplementation((name: string) => {
          if (name === 'authorization') return 'Bearer wrong-token';
          return undefined;
        }),
        query: {},
      } as any;

      const result = await resolveAuthContext(mockReq);

      // Wrong token should be rejected
      expect(result).toBeNull();
    });

    it('should reject requests with no token', async () => {
      process.env.NODE_ENV = 'test';
      process.env.CLERK_TEST_TOKEN = 'test-token';

      const { resolveAuthContext } = await import('./auth');

      const mockReq = {
        header: vi.fn().mockReturnValue(undefined),
        query: {},
      } as any;

      const result = await resolveAuthContext(mockReq);

      expect(result).toBeNull();
    });
  });

  describe('configuration safety', () => {
    it('should warn when both Clerk and test token are configured without E2E mode', async () => {
      process.env.NODE_ENV = 'development';
      process.env.CLERK_SECRET_KEY = 'sk_test_xxx';
      process.env.CLERK_TEST_TOKEN = 'test-token';
      process.env.E2E_TEST_MODE = undefined;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Just importing the module should trigger the warning check on first auth attempt
      const { resolveAuthContext } = await import('./auth');

      const mockReq = {
        header: vi.fn().mockImplementation((name: string) => {
          if (name === 'authorization') return 'Bearer test-token';
          return undefined;
        }),
        query: {},
      } as any;

      await resolveAuthContext(mockReq);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Both CLERK_SECRET_KEY and CLERK_TEST_TOKEN are set')
      );

      warnSpy.mockRestore();
    });
  });
});
