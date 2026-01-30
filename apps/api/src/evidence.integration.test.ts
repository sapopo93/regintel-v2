/**
 * Phase 8 Integration Test: Evidence Storage
 *
 * Validates content-addressed evidence blob storage with deduplication.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryStore } from './store';
import { generateTenantId } from './test-helpers';
import { computeBlobHash } from '@regintel/domain/evidence';
import type { TenantContext } from './store';

describe('integration:evidence', () => {
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

  it('duplicate blob upload returns existing content_hash', () => {
    const content = Buffer.from('test evidence content').toString('base64');

    // Upload blob first time
    const blob1 = store.createEvidenceBlob(ctx, {
      contentBase64: content,
      mimeType: 'text/plain',
    });

    // Verify hash starts with sha256:
    expect(blob1.blobHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Upload same blob again (should deduplicate)
    const blob2 = store.createEvidenceBlob(ctx, {
      contentBase64: content,
      mimeType: 'text/plain',
    });

    // Both blobs should have the same hash (deduplication)
    expect(blob2.blobHash).toBe(blob1.blobHash);
  });

  it('evidence record references blob via content_hash', () => {
    // Create blob
    const content = Buffer.from('policy document content').toString('base64');
    const blob = store.createEvidenceBlob(ctx, {
      contentBase64: content,
      mimeType: 'application/pdf',
    });

    // Create evidence record
    const record = store.createEvidenceRecord(ctx, {
      facilityId,
      providerId,
      blobHash: blob.blobHash,
      evidenceType: 'POLICY_DOCUMENT',
      fileName: 'staff-policy.pdf',
      description: 'Staff training policy',
    });

    expect(record.blobHash).toBe(blob.blobHash);
    expect(record.evidenceType).toBe('POLICY_DOCUMENT');
    expect(record.fileName).toBe('staff-policy.pdf');
    expect(record.tenantId).toBe(ctx.tenantId);
  });

  it('multiple tenants can reference same blob', () => {
    // Tenant A uploads blob
    const tenantA = generateTenantId();
    const ctxA = { tenantId: tenantA, actorId: 'actor-a' };

    // Create provider and facility for tenant A
    const providerA = store.createProvider(ctxA, {
      providerName: 'Provider A',
      orgRef: 'A-001',
    });

    const facilityA = store.createFacility(ctxA, {
      providerId: providerA.providerId,
      facilityName: 'Facility A',
      addressLine1: '123 A St',
      townCity: 'A Town',
      postcode: 'A1 1AA',
      cqcLocationId: '1-111111111',
      serviceType: 'residential',
    });

    const content = Buffer.from('shared policy content').toString('base64');
    const blobA = store.createEvidenceBlob(ctxA, {
      contentBase64: content,
      mimeType: 'application/pdf',
    });

    const recordA = store.createEvidenceRecord(ctxA, {
      facilityId: facilityA.id,
      providerId: providerA.providerId,
      blobHash: blobA.blobHash,
      evidenceType: 'POLICY',
      fileName: 'policy-a.pdf',
    });

    // Tenant B uploads same blob
    const tenantB = generateTenantId();
    const ctxB = { tenantId: tenantB, actorId: 'actor-b' };

    const providerB = store.createProvider(ctxB, {
      providerName: 'Provider B',
      orgRef: 'B-001',
    });

    const facilityB = store.createFacility(ctxB, {
      providerId: providerB.providerId,
      facilityName: 'Facility B',
      addressLine1: '123 B St',
      townCity: 'B Town',
      postcode: 'B1 1BB',
      cqcLocationId: '1-222222222',
      serviceType: 'nursing',
    });

    const blobB = store.createEvidenceBlob(ctxB, {
      contentBase64: content,
      mimeType: 'application/pdf',
    });

    const recordB = store.createEvidenceRecord(ctxB, {
      facilityId: facilityB.id,
      providerId: providerB.providerId,
      blobHash: blobB.blobHash,
      evidenceType: 'POLICY',
      fileName: 'policy-b.pdf',
    });

    // Both records reference same blob hash (deduplication)
    expect(recordA.blobHash).toBe(recordB.blobHash);
    expect(recordA.blobHash).toBe(blobA.blobHash);

    // But records are tenant-isolated
    expect(recordA.tenantId).toBe(tenantA);
    expect(recordB.tenantId).toBe(tenantB);
    expect(recordA.tenantId).not.toBe(recordB.tenantId);
  });

  it('evidence can be retrieved by facility', () => {
    // Create 3 evidence records for same facility
    for (let i = 1; i <= 3; i++) {
      const content = Buffer.from(`evidence ${i}`).toString('base64');
      const blob = store.createEvidenceBlob(ctx, {
        contentBase64: content,
        mimeType: 'text/plain',
      });

      store.createEvidenceRecord(ctx, {
        facilityId,
        providerId,
        blobHash: blob.blobHash,
        evidenceType: 'POLICY',
        fileName: `evidence-${i}.txt`,
      });
    }

    const evidence = store.listEvidenceByFacility(ctx, facilityId);
    expect(evidence).toHaveLength(3);
    expect(evidence.every((e) => e.facilityId === facilityId)).toBe(true);
  });

  it('different content produces different hashes', () => {
    const content1 = Buffer.from('content A').toString('base64');
    const content2 = Buffer.from('content B').toString('base64');

    const blob1 = store.createEvidenceBlob(ctx, {
      contentBase64: content1,
      mimeType: 'text/plain',
    });

    const blob2 = store.createEvidenceBlob(ctx, {
      contentBase64: content2,
      mimeType: 'text/plain',
    });

    expect(blob1.blobHash).not.toBe(blob2.blobHash);
  });
});
