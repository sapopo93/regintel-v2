import type { NextFunction, Request, Response } from 'express';
import { clerkClient } from '@clerk/express';
import { verifyToken } from '@clerk/backend';
import { buildConstitutionalMetadata } from './metadata';

export type AuthRole = 'FOUNDER' | 'PROVIDER';

/**
 * SECURITY HARDENING: Detect if we're in a production-like environment
 * where test auth should NEVER be allowed.
 *
 * Production mode is defined as:
 * - NODE_ENV === 'production' OR
 * - CLERK_SECRET_KEY is set (real Clerk configured) AND E2E_TEST_MODE is not 'true'
 *
 * This prevents accidental test auth bypass in production deployments.
 */
function isTestAuthAllowed(): boolean {
  const isNodeEnvTest = process.env.NODE_ENV === 'test';
  const isE2EMode = process.env.E2E_TEST_MODE === 'true';

  // Always allow in explicit test environments
  if (isNodeEnvTest || isE2EMode) {
    return true;
  }

  // If NODE_ENV is production, NEVER allow test auth
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // In development, allow test auth only if Clerk is not fully configured
  // This catches the case where someone sets CLERK_SECRET_KEY but forgets E2E_TEST_MODE
  const hasClerkSecret = !!process.env.CLERK_SECRET_KEY;
  const hasClerkTestToken = !!process.env.CLERK_TEST_TOKEN;

  // If Clerk is configured but test token is also set without E2E mode,
  // this is a dangerous configuration - log warning but allow in dev
  if (hasClerkSecret && hasClerkTestToken) {
    console.warn(
      '[AUTH SECURITY WARNING] Both CLERK_SECRET_KEY and CLERK_TEST_TOKEN are set ' +
      'but E2E_TEST_MODE is not enabled. Test auth is disabled to prevent security bypass. ' +
      'Set E2E_TEST_MODE=true if this is intentional.'
    );
    return false;
  }

  return true;
}

export interface AuthContext {
  tenantId: string;
  role: AuthRole;
  actorId: string;
  userId?: string; // Clerk user ID (when using Clerk auth)
}

function getTokenFromRequest(req: Request): string | null {
  const header = req.header('authorization') || '';
  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  const tokenParam = req.query.token ?? req.query.access_token;
  if (typeof tokenParam === 'string' && tokenParam.trim()) {
    return tokenParam.trim();
  }

  return null;
}

/**
 * Verify Clerk JWT and extract auth context
 */
async function resolveClerkAuth(token: string): Promise<AuthContext | null> {
  try {
    // Check if Clerk is configured
    if (!process.env.CLERK_SECRET_KEY) {
      return null;
    }

    // Verify JWT using Clerk
    const decoded = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!decoded || !decoded.sub) {
      return null;
    }

    // Get user details from Clerk
    const user = await clerkClient.users.getUser(decoded.sub);

    // Extract tenant from organization (or fallback to user ID)
    const userRecord = user as unknown as Record<string, unknown>;
    const orgMemberships = userRecord.organizationMemberships as Array<{ organization: { id: string } }> | undefined;
    const orgMembership = orgMemberships?.[0];
    const tenantId = orgMembership?.organization.id || user.id;

    // Get role from user public metadata (default to PROVIDER)
    const role = (user.publicMetadata?.role as AuthRole) || 'PROVIDER';

    return {
      tenantId,
      role,
      actorId: user.id,
      userId: user.id,
    };
  } catch (error) {
    console.error('Clerk auth verification failed:', error);
    return null;
  }
}

function resolveTestAuth(token: string, req: Request): AuthContext | null {
  const testToken = process.env.CLERK_TEST_TOKEN;
  if (!testToken || token !== testToken) {
    return null;
  }

  const role = (process.env.CLERK_TEST_ROLE as AuthRole) || 'FOUNDER';
  const requestedTenant = req.header('x-tenant-id')?.trim();
  const tenantId = requestedTenant || process.env.CLERK_TEST_TENANT_ID || 'test-tenant';
  const userId = process.env.CLERK_TEST_USER_ID || 'clerk-test-user';

  return {
    tenantId,
    role,
    actorId: userId,
    userId,
  };
}

export async function resolveAuthContext(req: Request): Promise<AuthContext | null> {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  // SECURITY HARDENING: Test auth only allowed in explicit test environments
  // This prevents test tokens from being accidentally accepted in production
  if (isTestAuthAllowed()) {
    const testAuth = resolveTestAuth(token, req);
    if (testAuth) {
      return testAuth;
    }
  }

  // Try Clerk authentication for production JWTs
  const clerkAuth = await resolveClerkAuth(token);
  if (clerkAuth) {
    // Allow FOUNDER role to override tenant via header
    if (clerkAuth.role === 'FOUNDER') {
      const requestedTenant = req.header('x-tenant-id')?.trim();
      if (requestedTenant) {
        clerkAuth.tenantId = requestedTenant;
      }
    }
    return clerkAuth;
  }

  // No valid authentication found
  return null;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const context = await resolveAuthContext(req);

  if (!context) {
    res.status(401).json({
      ...buildConstitutionalMetadata(),
      error: 'Unauthorized: Invalid or missing authentication token',
    });
    return;
  }

  req.auth = context;
  next();
}
