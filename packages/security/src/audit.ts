/**
 * Hash-Chained Audit Log Module
 *
 * Phase 0 Foundation: Immutable audit log with tamper detection.
 * All state-changing events append to the log with previous_event_hash.
 * Tampering invalidates the chain.
 */

import { createHash } from 'node:crypto';

export interface AuditEvent {
  id: string;
  timestamp: string;
  tenantId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  payload: Record<string, unknown>;
  previousEventHash: string | null;
  eventHash: string;
}

export interface AuditEventInput {
  tenantId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  payload: Record<string, unknown>;
}

/**
 * Computes a deterministic hash for an audit event payload.
 * Uses SHA-256 for cryptographic integrity.
 */
export function computePayloadHash(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Computes the event hash that includes the previous hash (chain link).
 */
export function computeEventHash(
  timestamp: string,
  tenantId: string,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  payloadHash: string,
  previousEventHash: string | null
): string {
  const data = [
    timestamp,
    tenantId,
    actorId,
    action,
    resourceType,
    resourceId,
    payloadHash,
    previousEventHash ?? 'GENESIS',
  ].join('|');

  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generates a unique event ID.
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Immutable hash-chained audit log.
 * Events can only be appended, never modified or deleted.
 */
export class AuditLog {
  private events: AuditEvent[] = [];
  private lastEventHash: string | null = null;

  /**
   * Appends a new event to the audit log.
   * Returns the created event with computed hashes.
   */
  append(input: AuditEventInput): AuditEvent {
    const id = generateEventId();
    const timestamp = new Date().toISOString();
    const payloadHash = computePayloadHash(input.payload);

    const eventHash = computeEventHash(
      timestamp,
      input.tenantId,
      input.actorId,
      input.action,
      input.resourceType,
      input.resourceId,
      payloadHash,
      this.lastEventHash
    );

    const event: AuditEvent = {
      id,
      timestamp,
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      payload: input.payload,
      previousEventHash: this.lastEventHash,
      eventHash,
    };

    this.events.push(event);
    this.lastEventHash = eventHash;

    return event;
  }

  /**
   * Returns all events (immutable copy).
   */
  getEvents(): readonly AuditEvent[] {
    return [...this.events];
  }

  /**
   * Returns events for a specific tenant.
   */
  getEventsForTenant(tenantId: string): readonly AuditEvent[] {
    return this.events.filter((e) => e.tenantId === tenantId);
  }

  /**
   * Returns the last event hash (chain tip).
   */
  getLastEventHash(): string | null {
    return this.lastEventHash;
  }

  /**
   * Verifies the integrity of the entire audit chain.
   * Returns true if the chain is valid, false if tampering detected.
   */
  verifyChain(): ChainVerificationResult {
    if (this.events.length === 0) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];

      // Verify previous hash link
      if (i === 0) {
        if (event.previousEventHash !== null) {
          errors.push(
            `Event ${i}: First event should have null previousEventHash`
          );
        }
      } else {
        const prevEvent = this.events[i - 1];
        if (event.previousEventHash !== prevEvent.eventHash) {
          errors.push(
            `Event ${i}: previousEventHash mismatch (expected ${prevEvent.eventHash}, got ${event.previousEventHash})`
          );
        }
      }

      // Verify event hash
      const payloadHash = computePayloadHash(event.payload);
      const expectedHash = computeEventHash(
        event.timestamp,
        event.tenantId,
        event.actorId,
        event.action,
        event.resourceType,
        event.resourceId,
        payloadHash,
        event.previousEventHash
      );

      if (event.eventHash !== expectedHash) {
        errors.push(
          `Event ${i}: eventHash mismatch (expected ${expectedHash}, got ${event.eventHash})`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clears the log (for testing only - not available in production).
   */
  clear(): void {
    this.events = [];
    this.lastEventHash = null;
  }
}

export interface ChainVerificationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Creates a tampered copy of an event for testing purposes.
 * DO NOT use in production.
 */
export function createTamperedEvent(
  original: AuditEvent,
  tamperedPayload: Record<string, unknown>
): AuditEvent {
  return {
    ...original,
    payload: tamperedPayload,
    // eventHash remains the same, causing verification to fail
  };
}
