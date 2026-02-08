/**
 * Database Integration for Worker Service
 *
 * Provides tenant-scoped database operations using Prisma.
 * This avoids importing from apps/api which uses .ts extensions that break after compilation.
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { scopeKey } from '@regintel/security/tenant';
import { createFacility } from '@regintel/domain/facility';

const prisma = new PrismaClient();

export interface TenantContext {
  tenantId: string;
  actorId: string;
}

export interface FacilityRecord {
  id: string;
  tenantId: string;
  providerId: string;
  facilityName: string;
  addressLine1: string;
  townCity: string;
  postcode: string;
  address: string;
  cqcLocationId: string;
  serviceType: string;
  capacity?: number;
  facilityHash: string;
  createdAt: string;
  createdBy: string;
  asOf: string;
  dataSource: 'CQC_API' | 'MANUAL';
  cqcSyncedAt: string | null;
  latestRating?: string;
  latestRatingDate?: string;
  inspectionStatus: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION';
  lastReportScrapedAt?: string | null;
  lastScrapedReportDate?: string;
  lastScrapedReportUrl?: string;
}

export interface EvidenceBlobRecord {
  blobHash: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface EvidenceRecordRecord {
  id: string;
  tenantId: string;
  providerId: string;
  facilityId: string;
  blobHash: string;
  mimeType: string;
  sizeBytes: number;
  evidenceType: string;
  fileName: string;
  description?: string;
  metadata?: Record<string, unknown>;
  uploadedAt: string;
  createdBy: string;
}

function toIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function computeHash(payload: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

/**
 * Execute database operation within tenant context using RLS.
 */
async function withTenant<T>(
  tenantId: string,
  operation: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set tenant context for RLS (this requires the database to have RLS policies)
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return operation(tx as unknown as PrismaClient);
  });
}

export class WorkerStore {
  async getFacilityById(ctx: TenantContext, facilityId: string): Promise<FacilityRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const facility = await tx.facility.findUnique({ where: { id: facilityId } });
      if (!facility) return undefined;
      return {
        id: facility.id,
        tenantId: facility.tenantId,
        providerId: facility.providerId,
        facilityName: facility.facilityName,
        addressLine1: facility.addressLine1,
        townCity: facility.townCity,
        postcode: facility.postcode,
        address: facility.address,
        cqcLocationId: facility.cqcLocationId,
        serviceType: facility.serviceType,
        capacity: facility.capacity ?? undefined,
        facilityHash: facility.facilityHash,
        createdAt: facility.createdAt.toISOString(),
        createdBy: facility.createdBy,
        asOf: facility.asOf.toISOString(),
        dataSource: facility.dataSource as 'CQC_API' | 'MANUAL',
        cqcSyncedAt: toIso(facility.cqcSyncedAt) ?? null,
        latestRating: facility.latestRating ?? undefined,
        latestRatingDate: facility.latestRatingDate ?? undefined,
        inspectionStatus: facility.inspectionStatus as FacilityRecord['inspectionStatus'],
        lastReportScrapedAt: toIso(facility.lastReportScrapedAt) ?? undefined,
        lastScrapedReportDate: facility.lastScrapedReportDate ?? undefined,
        lastScrapedReportUrl: facility.lastScrapedReportUrl ?? undefined,
      };
    });
  }

  async upsertFacility(
    ctx: TenantContext,
    input: {
      providerId: string;
      facilityName: string;
      addressLine1: string;
      townCity: string;
      postcode: string;
      cqcLocationId: string;
      serviceType: string;
      capacity?: number;
      dataSource: 'CQC_API' | 'MANUAL';
      cqcSyncedAt: string | null;
      latestRating?: string;
      latestRatingDate?: string;
      inspectionStatus?: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION';
      lastReportScrapedAt?: string | null;
      lastScrapedReportDate?: string;
      lastScrapedReportUrl?: string;
    }
  ): Promise<{ facility: FacilityRecord; isNew: boolean }> {
    return withTenant(ctx.tenantId, async (tx) => {
      const normalizedCqc = input.cqcLocationId.trim().toUpperCase();
      const existing = await tx.facility.findFirst({
        where: { providerId: input.providerId, cqcLocationId: normalizedCqc },
      });

      let isNew = false;
      let unscopedId: string;
      let createdAt: Date;
      let createdBy: string;

      if (existing) {
        unscopedId = existing.id.split(':').pop() || existing.id;
        createdAt = existing.createdAt;
        createdBy = existing.createdBy;
      } else {
        isNew = true;
        unscopedId = `facility-${randomUUID()}`;
        createdAt = new Date();
        createdBy = ctx.actorId;
      }

      const address = `${input.addressLine1.trim()}, ${input.townCity.trim()}, ${input.postcode.trim()}`;
      const domainFacility = createFacility({
        id: unscopedId,
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        facilityName: input.facilityName,
        address,
        cqcLocationId: normalizedCqc,
        serviceType: input.serviceType,
        capacity: input.capacity,
        createdBy,
      });

      let inspectionStatus: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION' =
        input.inspectionStatus || 'PENDING_FIRST_INSPECTION';

      if (input.latestRating && input.latestRatingDate) {
        inspectionStatus = 'INSPECTED';
      } else if (input.dataSource === 'CQC_API' && !input.latestRating) {
        inspectionStatus = 'NEVER_INSPECTED';
      }

      const now = new Date();
      const data = {
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        facilityName: domainFacility.facilityName,
        addressLine1: input.addressLine1.trim(),
        townCity: input.townCity.trim(),
        postcode: input.postcode.trim(),
        address: domainFacility.address,
        cqcLocationId: domainFacility.cqcLocationId,
        serviceType: domainFacility.serviceType,
        capacity: domainFacility.capacity ?? null,
        facilityHash: domainFacility.facilityHash,
        createdAt,
        createdBy,
        asOf: now,
        dataSource: input.dataSource,
        cqcSyncedAt: input.cqcSyncedAt ? new Date(input.cqcSyncedAt) : null,
        latestRating: input.latestRating ?? null,
        latestRatingDate: input.latestRatingDate ?? null,
        inspectionStatus,
        lastReportScrapedAt: input.lastReportScrapedAt ? new Date(input.lastReportScrapedAt) : null,
        lastScrapedReportDate: input.lastScrapedReportDate ?? null,
        lastScrapedReportUrl: input.lastScrapedReportUrl ?? null,
      };

      const facility = existing
        ? await tx.facility.update({ where: { id: existing.id }, data })
        : await tx.facility.create({ data: { id: domainFacility.id, ...data } });

      return {
        facility: {
          id: facility.id,
          tenantId: facility.tenantId,
          providerId: facility.providerId,
          facilityName: facility.facilityName,
          addressLine1: facility.addressLine1,
          townCity: facility.townCity,
          postcode: facility.postcode,
          address: facility.address,
          cqcLocationId: facility.cqcLocationId,
          serviceType: facility.serviceType,
          capacity: facility.capacity ?? undefined,
          facilityHash: facility.facilityHash,
          createdAt: facility.createdAt.toISOString(),
          createdBy: facility.createdBy,
          asOf: facility.asOf.toISOString(),
          dataSource: facility.dataSource as 'CQC_API' | 'MANUAL',
          cqcSyncedAt: toIso(facility.cqcSyncedAt) ?? null,
          latestRating: facility.latestRating ?? undefined,
          latestRatingDate: facility.latestRatingDate ?? undefined,
          inspectionStatus: facility.inspectionStatus as FacilityRecord['inspectionStatus'],
          lastReportScrapedAt: toIso(facility.lastReportScrapedAt) ?? undefined,
          lastScrapedReportDate: facility.lastScrapedReportDate ?? undefined,
          lastScrapedReportUrl: facility.lastScrapedReportUrl ?? undefined,
        },
        isNew,
      };
    });
  }

  async createEvidenceBlob(
    ctx: TenantContext,
    input: { contentHash: string; contentType: string; sizeBytes: number; uploadedAt: string; storagePath: string }
  ): Promise<EvidenceBlobRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const existing = await tx.evidenceBlob.findUnique({
        where: { contentHash: input.contentHash },
      });
      if (existing) {
        return {
          blobHash: existing.contentHash,
          mimeType: existing.contentType,
          sizeBytes: Number(existing.sizeBytes),
          uploadedAt: existing.uploadedAt.toISOString(),
        };
      }

      const blob = await tx.evidenceBlob.create({
        data: {
          contentHash: input.contentHash,
          contentType: input.contentType,
          sizeBytes: BigInt(input.sizeBytes),
          storagePath: input.storagePath,
          uploadedAt: new Date(input.uploadedAt),
        },
      });

      return {
        blobHash: blob.contentHash,
        mimeType: blob.contentType,
        sizeBytes: Number(blob.sizeBytes),
        uploadedAt: blob.uploadedAt.toISOString(),
      };
    });
  }

  async createEvidenceRecord(
    ctx: TenantContext,
    input: {
      facilityId: string;
      providerId: string;
      blobHash: string;
      evidenceType: string;
      fileName: string;
      description?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<EvidenceRecordRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const blob = await tx.evidenceBlob.findUnique({
        where: { contentHash: input.blobHash },
      });
      if (!blob) {
        throw new Error('Evidence blob not found');
      }

      const now = new Date();
      const id = scopeKey(ctx, `evidence-${randomUUID()}`);

      const record = await tx.evidenceRecord.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          providerId: input.providerId,
          facilityId: input.facilityId,
          contentHash: input.blobHash,
          evidenceType: input.evidenceType,
          title: input.fileName,
          fileName: input.fileName,
          description: input.description,
          collectedAt: now,
          createdAt: now,
          createdBy: ctx.actorId,
          mimeType: blob.contentType,
          sizeBytes: blob.sizeBytes,
          uploadedAt: now,
          metadata: input.metadata ?? {},
        },
      });

      return {
        id: record.id,
        tenantId: record.tenantId,
        providerId: record.providerId,
        facilityId: record.facilityId,
        blobHash: record.contentHash,
        mimeType: record.mimeType,
        sizeBytes: Number(record.sizeBytes),
        evidenceType: record.evidenceType,
        fileName: record.fileName,
        description: record.description ?? undefined,
        metadata: (record.metadata as Record<string, unknown>) ?? undefined,
        uploadedAt: record.uploadedAt.toISOString(),
        createdBy: record.createdBy,
      };
    });
  }

  async appendAuditEvent(
    ctx: TenantContext,
    entityId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    return withTenant(ctx.tenantId, async (tx) => {
      // Get the last event hash for chain integrity
      const lastEvent = await tx.auditEvent.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { timestamp: 'desc' },
        select: { eventHash: true },
      });

      const now = new Date();
      const payloadHash = computeHash(payload);
      const previousEventHash = lastEvent?.eventHash ?? null;
      const eventHash = computeHash({
        tenantId: ctx.tenantId,
        entityId,
        eventType,
        payloadHash,
        previousEventHash,
        timestamp: now.toISOString(),
      });

      await tx.auditEvent.create({
        data: {
          id: `audit-${randomUUID()}`,
          tenantId: ctx.tenantId,
          eventType,
          entityType: 'Provider',
          entityId,
          actor: ctx.actorId,
          payload,
          payloadHash,
          previousEventHash,
          eventHash,
          timestamp: now,
        },
      });
    });
  }
}

// Singleton instance
export const workerStore = new WorkerStore();
