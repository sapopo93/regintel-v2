/**
 * Phase 8 Integration Test: Reports Generation
 *
 * Validates that provider-facing reports are derived correctly from spine data.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStore } from './store';
import { generateTenantId } from './test-helpers';
import type { TenantContext } from './store';

describe('integration:reports', () => {
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

  it('derives confidence report from findings', () => {
    // Create mock session
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

    // Add findings with varying severity
    store.addFinding(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      regulationSectionId: 'Reg 12',
      topicId: 'test-topic',
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'CRITICAL',
      impactScore: 95,
      likelihoodScore: 90,
      compositeRiskScore: 95,
      title: 'Critical Finding',
      description: 'Critical issue',
      evidenceRequired: [],
      evidenceProvided: [],
      evidenceMissing: [],
    });

    store.addFinding(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      regulationSectionId: 'Reg 18',
      topicId: 'test-topic',
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'LOW',
      impactScore: 20,
      likelihoodScore: 30,
      compositeRiskScore: 20,
      title: 'Low Finding',
      description: 'Minor issue',
      evidenceRequired: [],
      evidenceProvided: [],
      evidenceMissing: [],
    });

    // Query findings (simulates report generation)
    const findings = store.listFindingsByProvider(ctx, providerId);
    const facilityFindings = findings.filter((f) => f.facilityId === facilityId);

    expect(facilityFindings).toHaveLength(2);
    expect(facilityFindings.some((f) => f.severity === 'CRITICAL')).toBe(true);
    expect(facilityFindings.some((f) => f.severity === 'LOW')).toBe(true);
  });

  it('risk register sorted by composite_risk_score DESC', () => {
    // Create session
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

    // Add findings in random order
    const scores = [45, 95, 20, 70];
    const severities: Array<'MEDIUM' | 'CRITICAL' | 'LOW' | 'HIGH'> = ['MEDIUM', 'CRITICAL', 'LOW', 'HIGH'];

    for (let i = 0; i < scores.length; i++) {
      store.addFinding(ctx, {
        providerId,
        facilityId,
        sessionId: session.sessionId,
        regulationSectionId: `Reg ${i}`,
        topicId: 'test-topic',
        origin: 'SYSTEM_MOCK',
        reportingDomain: 'MOCK_SIMULATION',
        severity: severities[i],
        impactScore: scores[i],
        likelihoodScore: scores[i],
        compositeRiskScore: scores[i],
        title: `Finding ${i}`,
        description: 'Test',
        evidenceRequired: [],
        evidenceProvided: [],
        evidenceMissing: [],
      });
    }

    // Query with sort (risk register logic)
    const findings = store.listFindingsByProvider(ctx, providerId);
    const sorted = [...findings].sort((a, b) => b.compositeRiskScore - a.compositeRiskScore);

    expect(sorted[0].compositeRiskScore).toBe(95);
    expect(sorted[1].compositeRiskScore).toBe(70);
    expect(sorted[2].compositeRiskScore).toBe(45);
    expect(sorted[3].compositeRiskScore).toBe(20);
  });

  it('report includes evidence coverage', () => {
    // Create evidence
    const content = Buffer.from('policy content').toString('base64');
    const blob = store.createEvidenceBlob(ctx, {
      contentBase64: content,
      mimeType: 'application/pdf',
    });

    store.createEvidenceRecord(ctx, {
      facilityId,
      providerId,
      blobHash: blob.blobHash,
      evidenceType: 'POLICY',
      fileName: 'policy.pdf',
    });

    // Check evidence count
    const evidence = store.listEvidenceByFacility(ctx, facilityId);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].evidenceType).toBe('POLICY');
  });

  it('exports can be retrieved by provider', () => {
    // Create mock session
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

    // Create export
    const exportRecord = store.createExport(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      format: 'PDF',
      content: 'mock pdf content',
      reportingDomain: 'MOCK_SIMULATION',
      mode: 'MOCK',
      reportSource: {
        type: 'mock',
        id: session.sessionId,
        asOf: new Date().toISOString(),
      },
      snapshotId: `snapshot-${session.sessionId}`,
    });

    expect(exportRecord.format).toBe('PDF');
    expect(exportRecord.reportingDomain).toBe('MOCK_SIMULATION');

    // Retrieve exports
    const exports = store.listExportsByProvider(ctx, providerId);
    expect(exports).toHaveLength(1);
    expect(exports[0].id).toBe(exportRecord.id);
  });
});
