/**
 * Phase 8 Integration Test: Mock Session Lifecycle
 *
 * Validates complete mock inspection session workflow from creation to completion.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStore } from './store';
import { generateTenantId } from './test-helpers';
import type { TenantContext } from './store';

describe('integration:mock-session', () => {
  let store: InMemoryStore;
  let ctx: TenantContext;
  let providerId: string;
  let facilityId: string;

  beforeEach(() => {
    store = new InMemoryStore();
    const tenantId = generateTenantId();
    ctx = { tenantId, actorId: 'test-actor' };

    // Setup test data
    const provider = store.createProvider(ctx, {
      providerName: 'Test Provider',
      orgRef: 'TEST-001',
    });
    providerId = provider.providerId;

    const facility = store.createFacility(ctx, {
      providerId,
      facilityName: 'Test Facility',
      addressLine1: '123 Test St',
      townCity: 'Testville',
      postcode: 'TE1 1ST',
      cqcLocationId: '1-123456789',
      serviceType: 'residential',
    });
    facilityId = facility.id;
  });

  it('completes full mock inspection lifecycle', () => {
    // Step 1: Create mock session
    const provider = store.getProviderById(ctx, providerId);
    const session = store.createMockSession(ctx, {
      provider: provider!,
      facilityId,
      topicId: 'test-topic',
      topicCatalogVersion: '1.0.0',
      topicCatalogHash: 'sha256:abc123',
      prsLogicProfilesVersion: '1.0.0',
      prsLogicProfilesHash: 'sha256:def456',
    });

    expect(session.status).toBe('IN_PROGRESS');
    expect(session.topicId).toBe('test-topic');
    expect(session.facilityId).toBe(facilityId);
    expect(session.providerId).toBe(providerId);

    // Step 2: Complete session
    const updated = {
      ...session,
      status: 'COMPLETED' as const,
      completedAt: new Date().toISOString(),
      followUpsUsed: 2,
    };
    store.updateSession(ctx, updated);

    // Step 3: Add finding linked to session
    const finding = store.addFinding(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      regulationSectionId: 'Reg 12(2)(a)',
      topicId: 'test-topic',
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'HIGH',
      impactScore: 80,
      likelihoodScore: 70,
      compositeRiskScore: 75,
      title: 'Test Finding',
      description: 'Generated from mock session',
      evidenceRequired: ['Policy'],
      evidenceProvided: [],
      evidenceMissing: ['Policy'],
    });

    expect(finding.sessionId).toBe(session.sessionId);
    expect(finding.origin).toBe('SYSTEM_MOCK');

    // Step 4: Verify session completed
    const retrieved = store.getSessionById(ctx, session.sessionId);
    expect(retrieved?.status).toBe('COMPLETED');
    expect(retrieved?.completedAt).toBeTruthy();
  });

  it('tracks session metadata (topic catalog and PRS versions)', () => {
    const provider = store.getProviderById(ctx, providerId);
    const session = store.createMockSession(ctx, {
      provider: provider!,
      facilityId,
      topicId: 'safe-care-treatment',
      topicCatalogVersion: '2.1.0',
      topicCatalogHash: 'sha256:topic123',
      prsLogicProfilesVersion: '1.5.0',
      prsLogicProfilesHash: 'sha256:prs456',
    });

    expect(session.topicCatalogVersion).toBe('2.1.0');
    expect(session.topicCatalogHash).toBe('sha256:topic123');
    expect(session.prsLogicProfilesVersion).toBe('1.5.0');
    expect(session.prsLogicProfilesHash).toBe('sha256:prs456');
  });

  it('multiple sessions can exist for same facility', () => {
    const provider = store.getProviderById(ctx, providerId);

    // Create session 1
    const session1 = store.createMockSession(ctx, {
      provider: provider!,
      facilityId,
      topicId: 'topic-1',
      topicCatalogVersion: '1.0.0',
      topicCatalogHash: 'sha256:abc',
      prsLogicProfilesVersion: '1.0.0',
      prsLogicProfilesHash: 'sha256:def',
    });

    // Create session 2
    const session2 = store.createMockSession(ctx, {
      provider: provider!,
      facilityId,
      topicId: 'topic-2',
      topicCatalogVersion: '1.0.0',
      topicCatalogHash: 'sha256:abc',
      prsLogicProfilesVersion: '1.0.0',
      prsLogicProfilesHash: 'sha256:def',
    });

    const sessions = store.listSessionsByProvider(ctx, providerId);
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.sessionId === session1.sessionId)).toBeTruthy();
    expect(sessions.find((s) => s.sessionId === session2.sessionId)).toBeTruthy();
  });
});
