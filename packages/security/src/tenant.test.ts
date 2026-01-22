import { describe, it, expect, beforeEach } from 'vitest';
import {
  scopeKey,
  extractTenantId,
  validateKeyBelongsToTenant,
  TenantIsolatedStore,
  TenantBoundaryViolationError,
  type TenantContext,
} from './tenant.js';

describe('security:tenant', () => {
  describe('Tenant Isolation - Key Scoping', () => {
    it('scopes keys with tenant ID prefix', () => {
      const ctx: TenantContext = { tenantId: 'tenant-a' };
      const scoped = scopeKey(ctx, 'resource-123');
      expect(scoped).toBe('tenant-a:resource-123');
    });

    it('extracts tenant ID from scoped key', () => {
      const tenantId = extractTenantId('tenant-a:resource-123');
      expect(tenantId).toBe('tenant-a');
    });

    it('returns null for malformed keys', () => {
      const tenantId = extractTenantId('no-colon-here');
      expect(tenantId).toBeNull();
    });

    it('validates key belongs to correct tenant', () => {
      const ctx: TenantContext = { tenantId: 'tenant-a' };
      const isValid = validateKeyBelongsToTenant(ctx, 'tenant-a:resource-123');
      expect(isValid).toBe(true);
    });

    it('rejects key from different tenant', () => {
      const ctx: TenantContext = { tenantId: 'tenant-a' };
      const isValid = validateKeyBelongsToTenant(ctx, 'tenant-b:resource-123');
      expect(isValid).toBe(false);
    });
  });

  describe('Tenant Isolation - Cross-Tenant Protection', () => {
    let store: TenantIsolatedStore<string>;
    const tenantA: TenantContext = { tenantId: 'tenant-a' };
    const tenantB: TenantContext = { tenantId: 'tenant-b' };

    beforeEach(() => {
      store = new TenantIsolatedStore<string>();
    });

    it('cross-tenant read is blocked', () => {
      // Tenant A writes data
      store.write(tenantA, 'secret-data', 'sensitive-value-a');

      // Tenant B tries to read it
      const result = store.read(tenantB, 'secret-data');

      // Should return undefined (not found for Tenant B)
      expect(result).toBeUndefined();

      // Tenant A can still read it
      const resultA = store.read(tenantA, 'secret-data');
      expect(resultA).toBe('sensitive-value-a');
    });

    it('cross-tenant write is blocked', () => {
      // Tenant A writes data
      store.write(tenantA, 'resource', 'value-a');

      // Tenant B writes to same key
      store.write(tenantB, 'resource', 'value-b');

      // Each tenant sees only their own data
      expect(store.read(tenantA, 'resource')).toBe('value-a');
      expect(store.read(tenantB, 'resource')).toBe('value-b');

      // Keys are isolated
      expect(store.listKeys(tenantA)).toEqual(['resource']);
      expect(store.listKeys(tenantB)).toEqual(['resource']);
    });

    it('blocks direct access to scoped keys from wrong tenant', () => {
      // Tenant A writes data
      store.write(tenantA, 'resource', 'value-a');

      // Tenant B tries to read by constructing the scoped key
      const tenantAScopedKey = 'tenant-a:resource';

      expect(() => {
        store.readByKey(tenantB, tenantAScopedKey);
      }).toThrow(TenantBoundaryViolationError);

      expect(() => {
        store.readByKey(tenantB, tenantAScopedKey);
      }).toThrow(/Cross-tenant access denied/);
    });

    it('blocks direct writes to scoped keys from wrong tenant', () => {
      // Tenant B tries to write to Tenant A's scoped key
      const tenantAScopedKey = 'tenant-a:resource';

      expect(() => {
        store.writeByKey(tenantB, tenantAScopedKey, 'malicious-value');
      }).toThrow(TenantBoundaryViolationError);

      expect(() => {
        store.writeByKey(tenantB, tenantAScopedKey, 'malicious-value');
      }).toThrow(/Cross-tenant write denied/);
    });

    it('allows valid scoped key access within same tenant', () => {
      const scopedKey = scopeKey(tenantA, 'resource');
      store.writeByKey(tenantA, scopedKey, 'value-a');

      const result = store.readByKey(tenantA, scopedKey);
      expect(result).toBe('value-a');
    });

    it('isolates key listings by tenant', () => {
      // Tenant A writes multiple resources
      store.write(tenantA, 'res-1', 'val-a-1');
      store.write(tenantA, 'res-2', 'val-a-2');

      // Tenant B writes multiple resources
      store.write(tenantB, 'res-1', 'val-b-1');
      store.write(tenantB, 'res-3', 'val-b-3');

      // Each tenant sees only their own keys
      const keysA = store.listKeys(tenantA);
      const keysB = store.listKeys(tenantB);

      expect(keysA).toHaveLength(2);
      expect(keysA).toContain('res-1');
      expect(keysA).toContain('res-2');
      expect(keysA).not.toContain('res-3');

      expect(keysB).toHaveLength(2);
      expect(keysB).toContain('res-1');
      expect(keysB).toContain('res-3');
      expect(keysB).not.toContain('res-2');
    });

    it('isolates deletions by tenant', () => {
      // Both tenants write to same key name
      store.write(tenantA, 'resource', 'value-a');
      store.write(tenantB, 'resource', 'value-b');

      // Tenant A deletes their resource
      const deleted = store.delete(tenantA, 'resource');
      expect(deleted).toBe(true);

      // Tenant A's is gone
      expect(store.read(tenantA, 'resource')).toBeUndefined();

      // Tenant B's still exists
      expect(store.read(tenantB, 'resource')).toBe('value-b');
    });
  });

  describe('Tenant Isolation - Edge Cases', () => {
    it('throws when tenantId is missing', () => {
      const ctx: TenantContext = { tenantId: '' };
      expect(() => scopeKey(ctx, 'key')).toThrow('TenantContext.tenantId is required');
    });

    it('throws when key is missing', () => {
      const ctx: TenantContext = { tenantId: 'tenant-a' };
      expect(() => scopeKey(ctx, '')).toThrow('Key is required');
    });

    it('handles keys with colons correctly', () => {
      const ctx: TenantContext = { tenantId: 'tenant-a' };
      const key = 'resource:sub:resource';
      const scoped = scopeKey(ctx, key);

      // Only the first colon is the tenant separator
      expect(scoped).toBe('tenant-a:resource:sub:resource');

      // Extraction should still work
      const extractedTenantId = extractTenantId(scoped);
      expect(extractedTenantId).toBe('tenant-a');
    });
  });
});
