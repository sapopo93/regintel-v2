import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditLog,
  computePayloadHash,
  computeEventHash,
  createTamperedEvent,
  type AuditEventInput,
} from './audit.js';

describe('audit:chain', () => {
  let auditLog: AuditLog;

  beforeEach(() => {
    auditLog = new AuditLog();
  });

  describe('Hash Chain Integrity', () => {
    it('hash chain verifies end-to-end for single event', () => {
      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: { name: 'Safety Policy' },
      });

      const result = auditLog.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('hash chain verifies end-to-end for multiple events', () => {
      // Append multiple events
      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: { name: 'Safety Policy' },
      });

      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'UPDATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: { name: 'Updated Safety Policy' },
      });

      auditLog.append({
        tenantId: 'tenant-b',
        actorId: 'user-2',
        action: 'CREATE',
        resourceType: 'Evidence',
        resourceId: 'evidence-456',
        payload: { type: 'document' },
      });

      const result = auditLog.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('verifies empty chain', () => {
      const result = auditLog.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Hash Chain Linking', () => {
    it('first event has null previousEventHash', () => {
      const event = auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: {},
      });

      expect(event.previousEventHash).toBeNull();
    });

    it('subsequent events link to previous event hash', () => {
      const event1 = auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: {},
      });

      const event2 = auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'UPDATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: {},
      });

      expect(event2.previousEventHash).toBe(event1.eventHash);
    });

    it('maintains chain integrity across multiple events', () => {
      const events = [];

      for (let i = 0; i < 5; i++) {
        events.push(
          auditLog.append({
            tenantId: 'tenant-a',
            actorId: 'user-1',
            action: 'CREATE',
            resourceType: 'Resource',
            resourceId: `resource-${i}`,
            payload: { index: i },
          })
        );
      }

      // Verify chain links
      for (let i = 1; i < events.length; i++) {
        expect(events[i].previousEventHash).toBe(events[i - 1].eventHash);
      }

      // Verify overall chain
      const result = auditLog.verifyChain();
      expect(result.valid).toBe(true);
    });

    it('tracks last event hash correctly', () => {
      expect(auditLog.getLastEventHash()).toBeNull();

      const event1 = auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: {},
      });

      expect(auditLog.getLastEventHash()).toBe(event1.eventHash);

      const event2 = auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'UPDATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: {},
      });

      expect(auditLog.getLastEventHash()).toBe(event2.eventHash);
    });
  });

  describe('Tamper Detection', () => {
    it('detects tampering of event payload', () => {
      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: { name: 'Original Name' },
      });

      // Directly mutate the events array (simulating tampering)
      const internalEvents = (auditLog as any).events;
      internalEvents[0].payload = { name: 'Tampered Name' };

      const result = auditLog.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('eventHash mismatch');
    });

    it('detects broken chain link', () => {
      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-1',
        payload: {},
      });

      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-2',
        payload: {},
      });

      // Break the chain link
      const internalEvents = (auditLog as any).events;
      internalEvents[1].previousEventHash = 'wrong-hash';

      const result = auditLog.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('previousEventHash mismatch'))).toBe(true);
    });

    it('detects tampering of event metadata', () => {
      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: {},
      });

      // Tamper with metadata
      const internalEvents = (auditLog as any).events;
      internalEvents[0].actorId = 'user-999';

      const result = auditLog.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('eventHash mismatch');
    });
  });

  describe('Hash Determinism', () => {
    it('produces same payload hash for identical payloads', () => {
      const payload1 = { name: 'Policy', version: 1, active: true };
      const payload2 = { name: 'Policy', version: 1, active: true };

      const hash1 = computePayloadHash(payload1);
      const hash2 = computePayloadHash(payload2);

      expect(hash1).toBe(hash2);
    });

    it('produces same payload hash regardless of property order', () => {
      const payload1 = { name: 'Policy', version: 1, active: true };
      const payload2 = { active: true, version: 1, name: 'Policy' };

      const hash1 = computePayloadHash(payload1);
      const hash2 = computePayloadHash(payload2);

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different payloads', () => {
      const payload1 = { name: 'Policy A' };
      const payload2 = { name: 'Policy B' };

      const hash1 = computePayloadHash(payload1);
      const hash2 = computePayloadHash(payload2);

      expect(hash1).not.toBe(hash2);
    });

    it('produces deterministic event hash', () => {
      const timestamp = '2024-01-01T00:00:00.000Z';
      const tenantId = 'tenant-a';
      const actorId = 'user-1';
      const action = 'CREATE';
      const resourceType = 'Policy';
      const resourceId = 'policy-123';
      const payloadHash = 'abc123';
      const previousHash = 'def456';

      const hash1 = computeEventHash(
        timestamp,
        tenantId,
        actorId,
        action,
        resourceType,
        resourceId,
        payloadHash,
        previousHash
      );

      const hash2 = computeEventHash(
        timestamp,
        tenantId,
        actorId,
        action,
        resourceType,
        resourceId,
        payloadHash,
        previousHash
      );

      expect(hash1).toBe(hash2);
    });
  });

  describe('Tenant Isolation in Audit Log', () => {
    it('filters events by tenant', () => {
      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-1',
        payload: {},
      });

      auditLog.append({
        tenantId: 'tenant-b',
        actorId: 'user-2',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-2',
        payload: {},
      });

      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'UPDATE',
        resourceType: 'Policy',
        resourceId: 'policy-1',
        payload: {},
      });

      const tenantAEvents = auditLog.getEventsForTenant('tenant-a');
      const tenantBEvents = auditLog.getEventsForTenant('tenant-b');

      expect(tenantAEvents).toHaveLength(2);
      expect(tenantBEvents).toHaveLength(1);

      expect(tenantAEvents.every((e) => e.tenantId === 'tenant-a')).toBe(true);
      expect(tenantBEvents.every((e) => e.tenantId === 'tenant-b')).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('returns immutable copy of events', () => {
      auditLog.append({
        tenantId: 'tenant-a',
        actorId: 'user-1',
        action: 'CREATE',
        resourceType: 'Policy',
        resourceId: 'policy-123',
        payload: {},
      });

      const events1 = auditLog.getEvents();
      const events2 = auditLog.getEvents();

      // Different array instances
      expect(events1).not.toBe(events2);

      // Same contents
      expect(events1).toEqual(events2);
    });
  });
});
