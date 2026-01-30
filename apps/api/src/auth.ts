import type { NextFunction, Request, Response } from 'express';
import { clerkClient } from '@clerk/express';
import { buildConstitutionalMetadata } from './metadata';

export type AuthRole = 'FOUNDER' | 'PROVIDER';

export interface AuthContext {
  tenantId: string;
  role: AuthRole;
  actorId: string;
  userId?: string; // Clerk user ID (when using Clerk auth)
}

const DEFAULT_TENANT_ID = 'demo';

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
    const decoded = await clerkClient.verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!decoded || !decoded.sub) {
      return null;
    }

    // Get user details from Clerk
    const user = await clerkClient.users.getUser(decoded.sub);

    // Extract tenant from organization (or fallback to user ID)
    const orgMembership = user.organizationMemberships?.[0];
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

/**
 * DEPRECATED: Legacy demo token authentication
 * Will be removed after Clerk migration is complete
 */
function resolveLegacyAuth(token: string, req: Request): AuthContext | null {
  const founderToken = process.env.FOUNDER_TOKEN;
  const providerToken = process.env.PROVIDER_TOKEN;

  let role: AuthRole | null = null;
  if (founderToken && token === founderToken) {
    role = 'FOUNDER';
  } else if (providerToken && token === providerToken) {
    role = 'PROVIDER';
  }

  if (!role) {
    return null;
  }

  const requestedTenant = req.header('x-tenant-id')?.trim();
  const tenantId = requestedTenant && role === 'FOUNDER'
    ? requestedTenant
    : (process.env.TENANT_ID || DEFAULT_TENANT_ID);

  return {
    tenantId,
    role,
    actorId: role.toLowerCase(),
  };
}

export async function resolveAuthContext(req: Request): Promise<AuthContext | null> {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  // Check for legacy demo tokens first (test/dev environment)
  const founderToken = process.env.FOUNDER_TOKEN;
  const providerToken = process.env.PROVIDER_TOKEN;
  const isLegacyToken = (founderToken && token === founderToken) ||
                        (providerToken && token === providerToken);

  if (isLegacyToken) {
    // Use legacy authentication directly for demo tokens
    return resolveLegacyAuth(token, req);
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
