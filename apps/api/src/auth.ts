import type { NextFunction, Request, Response } from 'express';
import { buildConstitutionalMetadata } from './metadata';

export type AuthRole = 'FOUNDER' | 'PROVIDER';

export interface AuthContext {
  tenantId: string;
  role: AuthRole;
  actorId: string;
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

export function resolveAuthContext(req: Request): AuthContext | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = resolveAuthContext(req);

  if (!context) {
    res.status(401).json({ ...buildConstitutionalMetadata(), error: 'Unauthorized' });
    return;
  }

  req.auth = context;
  next();
}
