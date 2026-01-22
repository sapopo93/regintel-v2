/**
 * Tenant Isolation Module
 *
 * Phase 0 Foundation: Multi-tenant isolation enforced at the data layer.
 * Application-level filtering alone is insufficient - this module provides
 * the enforcement mechanism that must be backed by RLS at the DB layer.
 */

export interface TenantContext {
  tenantId: string;
}

/**
 * Creates a tenant-scoped key by prefixing with tenant ID.
 * All primary keys in the system must be tenant-scoped.
 */
export function scopeKey(ctx: TenantContext, key: string): string {
  if (!ctx.tenantId) {
    throw new Error('TenantContext.tenantId is required');
  }
  if (!key) {
    throw new Error('Key is required');
  }
  return `${ctx.tenantId}:${key}`;
}

/**
 * Extracts tenant ID from a scoped key.
 * Returns null if the key format is invalid.
 */
export function extractTenantId(scopedKey: string): string | null {
  const colonIndex = scopedKey.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }
  const tenantId = scopedKey.slice(0, colonIndex);
  return tenantId || null;
}

/**
 * Validates that a scoped key belongs to the given tenant context.
 * This is a critical security check - prevents cross-tenant access.
 */
export function validateKeyBelongsToTenant(
  ctx: TenantContext,
  scopedKey: string
): boolean {
  const keyTenantId = extractTenantId(scopedKey);
  return keyTenantId === ctx.tenantId;
}

/**
 * In-memory tenant-isolated store for testing/development.
 * Production must use DB with RLS.
 */
export class TenantIsolatedStore<T> {
  private data: Map<string, T> = new Map();

  /**
   * Writes a value with tenant isolation.
   */
  write(ctx: TenantContext, key: string, value: T): void {
    const scopedKey = scopeKey(ctx, key);
    this.data.set(scopedKey, value);
  }

  /**
   * Reads a value with tenant isolation.
   * Returns undefined if not found OR if attempting cross-tenant access.
   */
  read(ctx: TenantContext, key: string): T | undefined {
    const scopedKey = scopeKey(ctx, key);
    return this.data.get(scopedKey);
  }

  /**
   * Attempts to read by raw scoped key - enforces tenant boundary.
   * Throws if the key doesn't belong to the tenant.
   */
  readByKey(ctx: TenantContext, scopedKey: string): T | undefined {
    if (!validateKeyBelongsToTenant(ctx, scopedKey)) {
      throw new TenantBoundaryViolationError(
        `Cross-tenant access denied: key ${scopedKey} does not belong to tenant ${ctx.tenantId}`
      );
    }
    return this.data.get(scopedKey);
  }

  /**
   * Attempts to write by raw scoped key - enforces tenant boundary.
   * Throws if the key doesn't belong to the tenant.
   */
  writeByKey(ctx: TenantContext, scopedKey: string, value: T): void {
    if (!validateKeyBelongsToTenant(ctx, scopedKey)) {
      throw new TenantBoundaryViolationError(
        `Cross-tenant write denied: key ${scopedKey} does not belong to tenant ${ctx.tenantId}`
      );
    }
    this.data.set(scopedKey, value);
  }

  /**
   * Lists all keys for a tenant (without the tenant prefix).
   */
  listKeys(ctx: TenantContext): string[] {
    const prefix = `${ctx.tenantId}:`;
    const keys: string[] = [];
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }
    return keys;
  }

  /**
   * Deletes a value with tenant isolation.
   */
  delete(ctx: TenantContext, key: string): boolean {
    const scopedKey = scopeKey(ctx, key);
    return this.data.delete(scopedKey);
  }

  /**
   * Clears all data (for testing only).
   */
  clear(): void {
    this.data.clear();
  }
}

/**
 * Error thrown when a tenant boundary violation is detected.
 */
export class TenantBoundaryViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantBoundaryViolationError';
  }
}
