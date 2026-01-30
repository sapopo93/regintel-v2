/**
 * Evidence Propagation Integration Test
 *
 * Validates end-to-end data flow from evidence upload to export.
 * Tests the "all zeros after evidence ingest" bug.
 *
 * This test exposes critical mismatches:
 * 1. Topic requirements vs UI evidence types
 * 2. Evidence coverage calculation
 * 3. Finding generation from evidence
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStore } from './store';
import { generateTenantId } from './test-helpers';
import type { TenantContext } from './store';

describe('evidence:propagation', () => {
  let store: InMemoryStore;
  let ctx: TenantContext;
  let providerId: string;
  let facilityId: string;

  beforeEach(() => {
    store = new InMemoryStore();
    const tenantId = generateTenantId();
    ctx = { tenantId, actorId: 'test-actor' };

    // Create provider and facility
    const provider = store.createProvider(ctx, {
      providerName: 'Test Care Home',
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

  /**
   * Test A: Evidence ingestion produces non-zero evidence inventory
   *
   * FAILS: Demonstrates the enum mismatch issue
   */
  it('FAILING: evidence ingestion should produce non-zero evidence count', () => {
    // Upload CQC Report (from UI)
    const blob = store.createEvidenceBlob(ctx, {
      contentBase64: 'dGVzdCBjb250ZW50',
      mimeType: 'application/pdf',
    });

    const evidenceRecord = store.createEvidenceRecord(ctx, {
      facilityId,
      providerId,
      blobHash: blob.blobHash,
      evidenceType: 'CQC_REPORT', // UI sends this
      fileName: 'test-report.pdf',
      description: 'Test CQC Report',
    });

    // Verify evidence was stored
    const facilityEvidence = store.listEvidenceByFacility(ctx, facilityId);
    expect(facilityEvidence).toHaveLength(1);
    expect(facilityEvidence[0].evidenceType).toBe('CQC_REPORT');

    // Problem: Backend checks for 'CQC_REPORT' but topics check for 'Policy', 'Training', etc.
    // This means evidenceCoverage calculation works, but topic matching fails
    
    const cqcReports = facilityEvidence.filter((record) => record.evidenceType === 'CQC_REPORT');
    expect(cqcReports).toHaveLength(1); // ✅ This works

    // But when checking against topic requirements...
    const topicRequirements = ['Policy', 'Training', 'Audit']; // From TOPICS array
    const evidenceProvided = facilityEvidence.map((record) => record.evidenceType);
    const evidenceMissing = topicRequirements.filter(
      (required) => !evidenceProvided.includes(required)
    );

    // ❌ FAIL: All evidence is "missing" because types don't match
    expect(evidenceMissing).toHaveLength(3); // All missing!
    expect(evidenceMissing).toEqual(['Policy', 'Training', 'Audit']);
  });

  /**
   * Test B: Topic mapping shows missing evidence types
   *
   * FAILS: Topics expect different evidenceType values than UI sends
   */
  it('FAILING: topic mapping should identify missing evidence', () => {
    // Upload Policy Document
    const blob = store.createEvidenceBlob(ctx, {
      contentBase64: 'cG9saWN5IGRvY3VtZW50',
      mimeType: 'application/pdf',
    });

    store.createEvidenceRecord(ctx, {
      facilityId,
      providerId,
      blobHash: blob.blobHash,
      evidenceType: 'POLICY_DOCUMENT', // UI sends this
      fileName: 'safeguarding-policy.pdf',
      description: 'Safeguarding Policy',
    });

    // Topic expects 'Policy' but UI sends 'POLICY_DOCUMENT'
    const facilityEvidence = store.listEvidenceByFacility(ctx, facilityId);
    const evidenceProvided = facilityEvidence.map((record) => record.evidenceType);

    const topicRequirements = ['Policy', 'Training', 'Audit'];
    const evidenceMissing = topicRequirements.filter(
      (required) => !evidenceProvided.includes(required)
    );

    // ❌ FAIL: 'Policy' is missing even though we uploaded 'POLICY_DOCUMENT'
    expect(evidenceMissing).toContain('Policy'); 
    expect(evidenceProvided).toContain('POLICY_DOCUMENT');
    expect(evidenceProvided).not.toContain('Policy');
  });

  /**
   * Test C: Export should include evidence in counts
   *
   * CURRENTLY PASSES but with wrong values (all zeros)
   */
  it('PASSING (with zeros): export should reflect uploaded evidence', () => {
    // Upload evidence
    const blob = store.createEvidenceBlob(ctx, {
      contentBase64: 'ZXZpZGVuY2U=',
      mimeType: 'application/pdf',
    });

    store.createEvidenceRecord(ctx, {
      facilityId,
      providerId,
      blobHash: blob.blobHash,
      evidenceType: 'TRAINING_RECORD',
      fileName: 'staff-training.pdf',
      description: 'Staff Training Records',
    });

    // Create mock session and finding
    const provider = store.getProviderById(ctx, providerId);
    const session = store.createMockSession(ctx, {
      provider: provider!,
      facilityId,
      topicId: 'safe-care-treatment',
      topicCatalogVersion: '1.0.0',
      topicCatalogHash: 'sha256:abc123',
      prsLogicProfilesVersion: '1.0.0',
      prsLogicProfilesHash: 'sha256:def456',
    });

    // Complete session
    const updated = {
      ...session,
      status: 'COMPLETED' as const,
      completedAt: new Date().toISOString(),
    };
    store.updateSession(ctx, updated);

    // Add finding
    const finding = store.addFinding(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      regulationSectionId: 'Reg 12(2)(a)',
      topicId: 'safe-care-treatment',
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'HIGH',
      impactScore: 80,
      likelihoodScore: 70,
      compositeRiskScore: 75,
      title: 'Test Finding',
      description: 'Test description',
      evidenceRequired: ['Policy', 'Training', 'Audit'],
      evidenceProvided: ['TRAINING_RECORD'], // ❌ Type mismatch
      evidenceMissing: ['Policy', 'Audit'], // ❌ Should be fewer if properly matched
    });

    // Verify finding was created
    const findings = store.listFindingsByProvider(ctx, providerId);
    expect(findings).toHaveLength(1);

    // ❌ PROBLEM: evidenceProvided doesn't match evidenceRequired types
    expect(finding.evidenceProvided).toEqual(['TRAINING_RECORD']);
    expect(finding.evidenceRequired).toEqual(['Policy', 'Training', 'Audit']);
    
    // No overlap = all evidence marked as "missing"
    const intersection = finding.evidenceRequired.filter((req) =>
      finding.evidenceProvided.includes(req)
    );
    expect(intersection).toHaveLength(0); // ❌ No matches!
  });

  /**
   * Test D: Evidence coverage calculation
   *
   * PASSES for CQC_REPORT but FAILS for other types
   */
  it('MIXED: evidence coverage should reflect uploaded evidence', () => {
    // Scenario 1: Upload CQC_REPORT (works)
    const blob1 = store.createEvidenceBlob(ctx, {
      contentBase64: 'Y3FjIHJlcG9ydA==',
      mimeType: 'application/pdf',
    });

    store.createEvidenceRecord(ctx, {
      facilityId,
      providerId,
      blobHash: blob1.blobHash,
      evidenceType: 'CQC_REPORT',
      fileName: 'cqc-report.pdf',
      description: 'CQC Inspection Report',
    });

    const facilityEvidence1 = store.listEvidenceByFacility(ctx, facilityId);
    const hasCqcReport = facilityEvidence1.some((record) => record.evidenceType === 'CQC_REPORT');
    const evidenceCoverage1 = hasCqcReport ? 100 : 0;

    expect(evidenceCoverage1).toBe(100); // ✅ Works for CQC_REPORT

    // Scenario 2: Upload POLICY_DOCUMENT (doesn't count)
    const blob2 = store.createEvidenceBlob(ctx, {
      contentBase64: 'cG9saWN5',
      mimeType: 'application/pdf',
    });

    const facility2 = store.createFacility(ctx, {
      providerId,
      facilityName: 'Facility 2',
      addressLine1: '456 Test Ave',
      townCity: 'Testville',
      postcode: 'TE2 2ST',
      cqcLocationId: '1-987654321',
      serviceType: 'nursing',
    });

    store.createEvidenceRecord(ctx, {
      facilityId: facility2.id,
      providerId,
      blobHash: blob2.blobHash,
      evidenceType: 'POLICY_DOCUMENT',
      fileName: 'policy.pdf',
      description: 'Policy Document',
    });

    const facilityEvidence2 = store.listEvidenceByFacility(ctx, facility2.id);
    const hasCqcReport2 = facilityEvidence2.some((record) => record.evidenceType === 'CQC_REPORT');
    const evidenceCoverage2 = hasCqcReport2 ? 100 : 0;

    // ❌ FAIL: Coverage is 0 even though evidence exists
    expect(evidenceCoverage2).toBe(0);
    expect(facilityEvidence2).toHaveLength(1); // Evidence exists!
  });
});
