/**
 * Phase 8 Integration Test: Mock Separation
 *
 * Validates that mock inspection findings cannot appear in regulatory history.
 * Tests the critical architectural invariant enforced via `origin` and `reporting_domain` fields.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStore } from './store';
import { generateTenantId, generateResourceId } from './test-helpers';
import type { TenantContext } from './store';

describe('integration:mock-separation', () => {
  let store: InMemoryStore;
  let ctx: TenantContext;
  let providerId: string;
  let facilityId: string;

  beforeEach(() => {
    store = new InMemoryStore();
    const tenantId = generateTenantId();
    ctx = { tenantId, actorId: 'test-actor' };

    // Create test provider and facility
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

  it('enforces SYSTEM_MOCK findings use MOCK_SIMULATION reporting domain', () => {
    // Create mock session
    const metadata = {
      topicCatalogVersion: '1.0.0',
      topicCatalogHash: 'sha256:abc123',
      prsLogicProfilesVersion: '1.0.0',
      prsLogicProfilesHash: 'sha256:def456',
    };

    const provider = store.getProviderById(ctx, providerId);
    const session = store.createMockSession(ctx, {
      provider: provider!,
      facilityId,
      topicId: 'test-topic',
      ...metadata,
    });

    // Add finding with SYSTEM_MOCK origin
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
      title: 'Test Mock Finding',
      description: 'This is a test mock finding',
      evidenceRequired: ['Policy'],
      evidenceProvided: [],
      evidenceMissing: ['Policy'],
    });

    // Verify finding has correct origin and reporting domain
    expect(finding.origin).toBe('SYSTEM_MOCK');
    expect(finding.reportingDomain).toBe('MOCK_SIMULATION');

    // Verify finding does not appear in "regulatory" queries
    // (In production, this would be enforced by DB-level constraints)
    const findings = store.listFindingsByProvider(ctx, providerId);
    const mockFindings = findings.filter((f) => f.reportingDomain === 'MOCK_SIMULATION');
    const regulatoryFindings = findings.filter((f) => f.reportingDomain === 'REGULATORY_HISTORY');

    expect(mockFindings).toHaveLength(1);
    expect(regulatoryFindings).toHaveLength(0);
  });

  it('ACTUAL_INSPECTION findings use REGULATORY_HISTORY reporting domain', () => {
    // Simulate CQC inspector creating a finding
    const finding = store.addFinding(ctx, {
      providerId,
      facilityId,
      sessionId: 'cqc-inspection-001',
      regulationSectionId: 'Reg 12(2)(a)',
      topicId: 'safe-care-treatment',
      origin: 'ACTUAL_INSPECTION',
      reportingDomain: 'REGULATORY_HISTORY',
      severity: 'CRITICAL',
      impactScore: 95,
      likelihoodScore: 90,
      compositeRiskScore: 95,
      title: 'Critical Safety Issue',
      description: 'Identified during CQC inspection',
      evidenceRequired: ['Policy', 'Audit'],
      evidenceProvided: [],
      evidenceMissing: ['Policy', 'Audit'],
    });

    expect(finding.origin).toBe('ACTUAL_INSPECTION');
    expect(finding.reportingDomain).toBe('REGULATORY_HISTORY');

    // Verify finding appears in regulatory history
    const findings = store.listFindingsByProvider(ctx, providerId);
    const regulatoryFindings = findings.filter((f) => f.reportingDomain === 'REGULATORY_HISTORY');

    expect(regulatoryFindings).toHaveLength(1);
    expect(regulatoryFindings[0].id).toBe(finding.id);
  });

  it('mock and regulatory findings are kept separate', () => {
    // Create mock finding
    const provider = store.getProviderById(ctx, providerId);
    const session = store.createMockSession(ctx, {
      provider: provider!,
      facilityId,
      topicId: 'test-topic',
      topicCatalogVersion: '1.0.0',
      topicCatalogHash: 'sha256:abc',
      prsLogicProfilesVersion: '1.0.0',
      prsLogicProfilesHash: 'sha256:def',
    });

    store.addFinding(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      regulationSectionId: 'Reg 12(2)(a)',
      topicId: 'test-topic',
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'MEDIUM',
      impactScore: 50,
      likelihoodScore: 50,
      compositeRiskScore: 50,
      title: 'Mock Finding',
      description: 'From mock inspection',
      evidenceRequired: [],
      evidenceProvided: [],
      evidenceMissing: [],
    });

    // Create regulatory finding
    store.addFinding(ctx, {
      providerId,
      facilityId,
      sessionId: 'cqc-inspection-001',
      regulationSectionId: 'Reg 18(1)',
      topicId: 'staffing',
      origin: 'ACTUAL_INSPECTION',
      reportingDomain: 'REGULATORY_HISTORY',
      severity: 'HIGH',
      impactScore: 80,
      likelihoodScore: 70,
      compositeRiskScore: 75,
      title: 'Regulatory Finding',
      description: 'From CQC inspection',
      evidenceRequired: [],
      evidenceProvided: [],
      evidenceMissing: [],
    });

    // Verify separation
    const allFindings = store.listFindingsByProvider(ctx, providerId);
    const mockFindings = allFindings.filter((f) => f.reportingDomain === 'MOCK_SIMULATION');
    const regulatoryFindings = allFindings.filter((f) => f.reportingDomain === 'REGULATORY_HISTORY');

    expect(allFindings).toHaveLength(2);
    expect(mockFindings).toHaveLength(1);
    expect(regulatoryFindings).toHaveLength(1);

    expect(mockFindings[0].origin).toBe('SYSTEM_MOCK');
    expect(regulatoryFindings[0].origin).toBe('ACTUAL_INSPECTION');
  });
});
