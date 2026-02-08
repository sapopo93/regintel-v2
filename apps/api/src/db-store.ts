import { randomUUID, createHash } from 'node:crypto';
import { createFacility } from '@regintel/domain/facility';
import { scopeKey, unscopeKey } from '@regintel/security/tenant';
import { Prisma, Domain as PrismaDomain, ProviderRegulatoryState as PrismaProviderRegulatoryState } from '@prisma/client';
import { withTenant } from './db';
import type {
  ProviderRecord,
  FacilityRecord,
  EvidenceBlobRecord,
  EvidenceRecordRecord,
  MockSessionRecord,
  FindingRecord,
  ExportRecord,
  AuditEventRecord,
  TenantContext,
} from './store';

const DEFAULT_MAX_TOTAL_QUESTIONS = 10;
const DEFAULT_MAX_FOLLOWUPS = 4;

function toIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

function toProviderRecord(row: {
  providerId: string;
  tenantId: string;
  providerName: string;
  orgRef: string | null;
  asOf: Date;
  prsState: PrismaProviderRegulatoryState;
  registeredBeds: number;
  serviceTypes: string[];
  createdAt: Date;
  createdBy: string;
}): ProviderRecord {
  return {
    providerId: row.providerId,
    tenantId: row.tenantId,
    providerName: row.providerName,
    orgRef: row.orgRef ?? undefined,
    asOf: row.asOf.toISOString(),
    prsState: row.prsState,
    registeredBeds: row.registeredBeds,
    serviceTypes: row.serviceTypes,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

function toFacilityRecord(row: {
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
  capacity: number | null;
  facilityHash: string;
  createdAt: Date;
  createdBy: string;
  asOf: Date;
  dataSource: 'CQC_API' | 'MANUAL';
  cqcSyncedAt: Date | null;
  latestRating: string | null;
  latestRatingDate: string | null;
  inspectionStatus: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION';
  lastReportScrapedAt: Date | null;
  lastScrapedReportDate: string | null;
  lastScrapedReportUrl: string | null;
}): FacilityRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    facilityName: row.facilityName,
    addressLine1: row.addressLine1,
    townCity: row.townCity,
    postcode: row.postcode,
    address: row.address,
    cqcLocationId: row.cqcLocationId,
    serviceType: row.serviceType,
    capacity: row.capacity ?? undefined,
    facilityHash: row.facilityHash,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    asOf: row.asOf.toISOString(),
    dataSource: row.dataSource,
    cqcSyncedAt: toIso(row.cqcSyncedAt) ?? null,
    latestRating: row.latestRating ?? undefined,
    latestRatingDate: row.latestRatingDate ?? undefined,
    inspectionStatus: row.inspectionStatus,
    lastReportScrapedAt: toIso(row.lastReportScrapedAt) ?? undefined,
    lastScrapedReportDate: row.lastScrapedReportDate ?? undefined,
    lastScrapedReportUrl: row.lastScrapedReportUrl ?? undefined,
  };
}

function toEvidenceBlobRecord(row: {
  contentHash: string;
  contentType: string;
  sizeBytes: bigint;
  uploadedAt: Date;
}): EvidenceBlobRecord {
  return {
    blobHash: row.contentHash,
    mimeType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

function toEvidenceRecord(row: {
  id: string;
  tenantId: string;
  providerId: string;
  facilityId: string;
  contentHash: string;
  evidenceType: string;
  fileName: string;
  description: string | null;
  uploadedAt: Date;
  createdBy: string;
  mimeType: string;
  sizeBytes: bigint;
  metadata: unknown;
}): EvidenceRecordRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    facilityId: row.facilityId,
    blobHash: row.contentHash,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    evidenceType: row.evidenceType,
    fileName: row.fileName,
    description: row.description ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    uploadedAt: row.uploadedAt.toISOString(),
    createdBy: row.createdBy,
  };
}

function extractProviderSnapshot(metadata: unknown): MockSessionRecord['providerSnapshot'] | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const data = metadata as { providerSnapshot?: MockSessionRecord['providerSnapshot'] };
  return data.providerSnapshot ?? null;
}

function toMockSessionRecord(input: {
  session: {
    id: string;
    tenantId: string;
    providerId: string;
    facilityId: string;
    mode: 'MOCK' | 'REAL';
    topicId: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
    followUpsUsed: number;
    maxFollowUps: number;
    startedAt: Date;
    completedAt: Date | null;
    topicCatalogVersion: string;
    topicCatalogHash: string;
    prsLogicProfilesVersion: string;
    prsLogicProfilesHash: string;
  };
  providerSnapshot: MockSessionRecord['providerSnapshot'];
}): MockSessionRecord {
  const { session, providerSnapshot } = input;
  return {
    sessionId: session.id,
    tenantId: session.tenantId,
    providerId: session.providerId,
    facilityId: session.facilityId,
    mode: 'MOCK',
    providerSnapshot,
    topicId: session.topicId,
    status: session.status,
    followUpsUsed: session.followUpsUsed,
    maxFollowUps: session.maxFollowUps,
    createdAt: session.startedAt.toISOString(),
    completedAt: toIso(session.completedAt),
    topicCatalogVersion: session.topicCatalogVersion,
    topicCatalogHash: session.topicCatalogHash,
    prsLogicProfilesVersion: session.prsLogicProfilesVersion,
    prsLogicProfilesHash: session.prsLogicProfilesHash,
  };
}

function toFindingRecord(row: {
  id: string;
  tenantId: string;
  providerId: string;
  facilityId: string;
  sessionId: string;
  regulationSectionId: string;
  topicId: string;
  origin: 'SYSTEM_MOCK' | 'ACTUAL_INSPECTION' | 'SELF_IDENTIFIED';
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  impactScore: number;
  likelihoodScore: number;
  compositeRiskScore: number;
  title: string;
  description: string;
  evidenceRequired: string[];
  evidenceProvided: string[];
  evidenceMissing: string[];
  deterministicHash: string;
  identifiedAt: Date;
}): FindingRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    facilityId: row.facilityId,
    sessionId: row.sessionId,
    regulationSectionId: row.regulationSectionId,
    topicId: row.topicId,
    origin: row.origin,
    reportingDomain: row.reportingDomain,
    severity: row.severity === 'INFO' ? 'LOW' : row.severity,
    impactScore: row.impactScore,
    likelihoodScore: row.likelihoodScore,
    compositeRiskScore: row.compositeRiskScore,
    title: row.title,
    description: row.description,
    evidenceRequired: row.evidenceRequired,
    evidenceProvided: row.evidenceProvided,
    evidenceMissing: row.evidenceMissing,
    deterministicHash: row.deterministicHash,
    createdAt: row.identifiedAt.toISOString(),
  };
}

function toExportRecord(row: {
  id: string;
  tenantId: string;
  providerId: string;
  facilityId: string;
  sessionId: string;
  format: 'CSV' | 'PDF' | 'BLUE_OCEAN' | 'BLUE_OCEAN_BOARD' | 'BLUE_OCEAN_AUDIT';
  content: string;
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
  mode: 'MOCK' | 'REAL';
  reportSourceType: string;
  reportSourceId: string;
  reportSourceAsOf: string;
  snapshotId: string;
  generatedAt: Date;
  expiresAt: Date;
}): ExportRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    facilityId: row.facilityId,
    sessionId: row.sessionId,
    format: row.format,
    content: row.content,
    reportingDomain: row.reportingDomain,
    mode: row.mode,
    reportSource: {
      type: row.reportSourceType as 'cqc_upload' | 'mock',
      id: row.reportSourceId,
      asOf: row.reportSourceAsOf,
    },
    snapshotId: row.snapshotId,
    generatedAt: row.generatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function toAuditEventRecord(row: {
  id: string;
  eventType: string;
  timestamp: Date;
  actor: string;
  payloadHash: string;
  previousEventHash: string | null;
  eventHash: string;
}): AuditEventRecord {
  return {
    eventId: row.id,
    eventType: row.eventType,
    timestamp: row.timestamp.toISOString(),
    userId: row.actor,
    payloadHash: row.payloadHash,
    previousEventHash: row.previousEventHash ?? undefined,
    eventHash: row.eventHash,
  };
}

function computeHash(payload: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function deriveRegulationId(sectionId: string): string {
  const match = /Reg\\s*(\\d+)/i.exec(sectionId);
  if (!match) return sectionId;
  return `cqc-reg-${match[1]}-v1`;
}

async function updateProviderAggregates(
  tx: Prisma.TransactionClient,
  providerId: string
): Promise<void> {
  const facilities = await tx.facility.findMany({
    where: { providerId },
    select: { serviceType: true, capacity: true },
  });

  const serviceTypes = Array.from(new Set(facilities.map((facility) => facility.serviceType)));
  const registeredBeds = facilities.reduce((sum, facility) => sum + (facility.capacity ?? 0), 0);

  await tx.provider.update({
    where: { providerId },
    data: { serviceTypes, registeredBeds },
  });
}

export class PrismaStore {
  async seedDemoProvider(ctx: TenantContext): Promise<ProviderRecord | null> {
    return withTenant(ctx.tenantId, async (tx) => {
      const providerId = scopeKey(ctx, 'provider-1');
      const existing = await tx.provider.findUnique({ where: { providerId } });
      if (existing) {
        return toProviderRecord(existing);
      }

      const now = new Date();
      const provider = await tx.provider.create({
        data: {
          providerId,
          tenantId: ctx.tenantId,
          providerName: 'Demo Care Provider',
          orgRef: 'DEMO-ORG-001',
          asOf: now,
          prsState: 'ESTABLISHED',
          registeredBeds: 50,
          serviceTypes: ['residential', 'nursing'],
          createdAt: now,
          createdBy: 'SYSTEM',
        },
      });

      await this.appendAuditEvent(ctx, providerId, 'PROVIDER_CREATED', {
        providerId,
        source: 'SEED_DATA',
      });

      return toProviderRecord(provider);
    });
  }

  async listProviders(ctx: TenantContext): Promise<ProviderRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.provider.findMany({ orderBy: { createdAt: 'asc' } });
      return rows.map(toProviderRecord);
    });
  }

  async createProvider(
    ctx: TenantContext,
    input: { providerName: string; orgRef?: string }
  ): Promise<ProviderRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const providerId = scopeKey(ctx, `provider-${randomUUID()}`);
      const now = new Date();

      const provider = await tx.provider.create({
        data: {
          providerId,
          tenantId: ctx.tenantId,
          providerName: input.providerName,
          orgRef: input.orgRef,
          asOf: now,
          prsState: 'ESTABLISHED',
          registeredBeds: 0,
          serviceTypes: [],
          createdAt: now,
          createdBy: ctx.actorId,
        },
      });

      return toProviderRecord(provider);
    });
  }

  async getProviderById(ctx: TenantContext, providerId: string): Promise<ProviderRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const provider = await tx.provider.findUnique({ where: { providerId } });
      return provider ? toProviderRecord(provider) : undefined;
    });
  }

  async createFacility(
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
    }
  ): Promise<FacilityRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const provider = await tx.provider.findUnique({ where: { providerId: input.providerId } });
      if (!provider) {
        throw new Error('Provider not found');
      }

      const normalizedCqc = input.cqcLocationId.trim().toUpperCase();
      const existing = await tx.facility.findFirst({
        where: { providerId: input.providerId, cqcLocationId: normalizedCqc },
      });

      if (existing) {
        throw new Error('Facility with this CQC Location ID already exists for provider');
      }

      const unscopedId = `facility-${randomUUID()}`;
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
        createdBy: ctx.actorId,
      });

      const facility = await tx.facility.create({
        data: {
          id: domainFacility.id,
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
          createdAt: new Date(domainFacility.createdAt),
          createdBy: domainFacility.createdBy,
          asOf: new Date(domainFacility.createdAt),
          dataSource: 'MANUAL',
          cqcSyncedAt: null,
          inspectionStatus: 'PENDING_FIRST_INSPECTION',
        },
      });

      await updateProviderAggregates(tx, input.providerId);

      return toFacilityRecord(facility);
    });
  }

  async listFacilitiesByProvider(ctx: TenantContext, providerId: string): Promise<FacilityRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const facilities = await tx.facility.findMany({
        where: { providerId },
        orderBy: { createdAt: 'asc' },
      });
      return facilities.map(toFacilityRecord);
    });
  }

  async listFacilities(ctx: TenantContext): Promise<FacilityRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const facilities = await tx.facility.findMany({ orderBy: { createdAt: 'asc' } });
      return facilities.map(toFacilityRecord);
    });
  }

  async getFacilityById(ctx: TenantContext, facilityId: string): Promise<FacilityRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const facility = await tx.facility.findUnique({ where: { id: facilityId } });
      return facility ? toFacilityRecord(facility) : undefined;
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
      const provider = await tx.provider.findUnique({ where: { providerId: input.providerId } });
      if (!provider) {
        throw new Error('Provider not found');
      }

      const normalizedCqc = input.cqcLocationId.trim().toUpperCase();
      const existing = await tx.facility.findFirst({
        where: { providerId: input.providerId, cqcLocationId: normalizedCqc },
      });

      let isNew = false;
      let unscopedId: string;
      let createdAt: Date;
      let createdBy: string;

      if (existing) {
        const existingUnscoped = unscopeKey(ctx, existing.id);
        if (!existingUnscoped) {
          throw new Error('Invalid facility ID format');
        }
        unscopedId = existingUnscoped;
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

      await updateProviderAggregates(tx, input.providerId);

      return { facility: toFacilityRecord(facility), isNew };
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
        return toEvidenceBlobRecord(existing);
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

      return toEvidenceBlobRecord(blob);
    });
  }

  async getEvidenceBlob(ctx: TenantContext, blobHash: string): Promise<EvidenceBlobRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const blob = await tx.evidenceBlob.findUnique({ where: { contentHash: blobHash } });
      return blob ? toEvidenceBlobRecord(blob) : undefined;
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

      return toEvidenceRecord(record);
    });
  }

  async listEvidenceByFacility(ctx: TenantContext, facilityId: string): Promise<EvidenceRecordRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const records = await tx.evidenceRecord.findMany({
        where: { facilityId },
        orderBy: { uploadedAt: 'desc' },
      });
      return records.map(toEvidenceRecord);
    });
  }

  async listEvidenceByProvider(ctx: TenantContext, providerId: string): Promise<EvidenceRecordRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const records = await tx.evidenceRecord.findMany({
        where: { providerId },
        orderBy: { uploadedAt: 'desc' },
      });
      return records.map(toEvidenceRecord);
    });
  }

  /**
   * Find an evidence record by content hash for the given tenant.
   * Used for blob ownership verification - ensures the blob belongs to this tenant.
   */
  async getEvidenceRecordByContentHash(
    ctx: TenantContext,
    contentHash: string
  ): Promise<EvidenceRecordRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const record = await tx.evidenceRecord.findFirst({
        where: { contentHash },
      });
      return record ? toEvidenceRecord(record) : undefined;
    });
  }

  async createMockSession(
    ctx: TenantContext,
    input: {
      provider: ProviderRecord;
      facilityId: string;
      topicId: string;
      topicCatalogVersion: string;
      topicCatalogHash: string;
      prsLogicProfilesVersion: string;
      prsLogicProfilesHash: string;
      maxFollowUps?: number;
      maxTotalQuestions?: number;
    }
  ): Promise<MockSessionRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const providerId = input.provider.providerId;
      const providerSnapshot = {
        providerId,
        providerName: input.provider.providerName,
        asOf: input.provider.asOf,
        prsState: input.provider.prsState,
        registeredBeds: input.provider.registeredBeds,
        serviceTypes: input.provider.serviceTypes,
      };

      const facility = await tx.facility.findUnique({ where: { id: input.facilityId } });
      if (!facility || facility.providerId !== providerId) {
        throw new Error('Facility not found');
      }

      const snapshotPayload = {
        tenantId: ctx.tenantId,
        providerId,
        asOf: new Date().toISOString(),
        regulatoryState: input.provider.prsState,
        providerSnapshot,
      };
      const snapshotHash = computeHash(snapshotPayload);

      const contextSnapshot = await tx.providerContextSnapshot.create({
        data: {
          tenantId: ctx.tenantId,
          providerId,
          asOf: new Date(),
          regulatoryState: input.provider.prsState as PrismaProviderRegulatoryState,
          metadata: { providerSnapshot },
          enabledDomains: [PrismaDomain.CQC],
          activeRegulationIds: [],
          activePolicyIds: [],
          snapshotHash,
          createdBy: ctx.actorId,
        },
      });

      const sessionId = scopeKey(ctx, `session-${randomUUID()}`);
      const now = new Date();
      const maxFollowUps = input.maxFollowUps ?? DEFAULT_MAX_FOLLOWUPS;
      const maxTotalQuestions = input.maxTotalQuestions ?? DEFAULT_MAX_TOTAL_QUESTIONS;

      const sessionPayload = {
        sessionId,
        providerId,
        facilityId: input.facilityId,
        topicId: input.topicId,
        maxFollowUps,
        maxTotalQuestions,
        startedAt: now.toISOString(),
      };
      const sessionHash = computeHash(sessionPayload);

      const session = await tx.mockInspectionSession.create({
        data: {
          id: sessionId,
          tenantId: ctx.tenantId,
          domain: PrismaDomain.CQC,
          contextSnapshotId: contextSnapshot.id,
          providerId,
          facilityId: input.facilityId,
          topicId: input.topicId,
          mode: 'MOCK',
          logicProfileId: `prs-logic-${input.prsLogicProfilesVersion}`,
          status: 'IN_PROGRESS',
          totalQuestionsAsked: 0,
          totalFindingsDrafted: 0,
          maxFollowupsPerTopic: maxFollowUps,
          maxTotalQuestions,
          followUpsUsed: 0,
          maxFollowUps,
          topicCatalogVersion: input.topicCatalogVersion,
          topicCatalogHash: input.topicCatalogHash,
          prsLogicProfilesVersion: input.prsLogicProfilesVersion,
          prsLogicProfilesHash: input.prsLogicProfilesHash,
          sessionHash,
          startedAt: now,
          createdBy: ctx.actorId,
        },
      });

      return toMockSessionRecord({ session, providerSnapshot });
    });
  }

  async listSessionsByProvider(ctx: TenantContext, providerId: string): Promise<MockSessionRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const sessions = await tx.mockInspectionSession.findMany({
        where: { providerId },
        include: { provider: true, contextSnapshot: true },
        orderBy: { startedAt: 'desc' },
      });

      return sessions.map((session) => {
        const snapshot =
          extractProviderSnapshot(session.contextSnapshot?.metadata) ??
          ({
            providerId: session.provider.providerId,
            providerName: session.provider.providerName,
            asOf: session.provider.asOf.toISOString(),
            prsState: session.provider.prsState,
            registeredBeds: session.provider.registeredBeds,
            serviceTypes: session.provider.serviceTypes,
          } satisfies MockSessionRecord['providerSnapshot']);

        return toMockSessionRecord({ session, providerSnapshot: snapshot });
      });
    });
  }

  async getSessionById(ctx: TenantContext, sessionId: string): Promise<MockSessionRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const session = await tx.mockInspectionSession.findUnique({
        where: { id: sessionId },
        include: { provider: true, contextSnapshot: true },
      });
      if (!session) {
        return undefined;
      }

      const snapshot =
        extractProviderSnapshot(session.contextSnapshot?.metadata) ??
        ({
          providerId: session.provider.providerId,
          providerName: session.provider.providerName,
          asOf: session.provider.asOf.toISOString(),
          prsState: session.provider.prsState,
          registeredBeds: session.provider.registeredBeds,
          serviceTypes: session.provider.serviceTypes,
        } satisfies MockSessionRecord['providerSnapshot']);

      return toMockSessionRecord({ session, providerSnapshot: snapshot });
    });
  }

  async updateSession(ctx: TenantContext, session: MockSessionRecord): Promise<void> {
    await withTenant(ctx.tenantId, async (tx) => {
      await tx.mockInspectionSession.update({
        where: { id: session.sessionId },
        data: {
          status: session.status,
          followUpsUsed: session.followUpsUsed,
          completedAt: session.completedAt ? new Date(session.completedAt) : null,
        },
      });
    });
  }

  async addFinding(
    ctx: TenantContext,
    input: Omit<FindingRecord, 'id' | 'tenantId' | 'deterministicHash' | 'createdAt'>
  ): Promise<FindingRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const session = await tx.mockInspectionSession.findUnique({
        where: { id: input.sessionId },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      const now = new Date();
      const createdAt = now.toISOString();
      const payload = { ...input, createdAt };
      const deterministicHash = computeHash(payload);

      const record = await tx.finding.create({
        data: {
          id: scopeKey(ctx, `finding-${randomUUID()}`),
          tenantId: ctx.tenantId,
          domain: PrismaDomain.CQC,
          contextSnapshotId: session.contextSnapshotId,
          providerId: input.providerId,
          facilityId: input.facilityId,
          sessionId: input.sessionId,
          topicId: input.topicId,
          origin: input.origin,
          reportingDomain: input.reportingDomain,
          regulationId: deriveRegulationId(input.regulationSectionId),
          regulationSectionId: input.regulationSectionId,
          title: input.title,
          description: input.description,
          severity: input.severity,
          impactScore: input.impactScore,
          likelihoodScore: input.likelihoodScore,
          compositeRiskScore: input.compositeRiskScore,
          evidenceIds: [],
          evidenceRequired: input.evidenceRequired,
          evidenceProvided: input.evidenceProvided,
          evidenceMissing: input.evidenceMissing,
          identifiedAt: now,
          identifiedBy: ctx.actorId,
          deterministicHash,
        },
      });

      return toFindingRecord({
        id: record.id,
        tenantId: record.tenantId,
        providerId: record.providerId,
        facilityId: record.facilityId,
        sessionId: record.sessionId,
        regulationSectionId: record.regulationSectionId,
        topicId: record.topicId,
        origin: record.origin,
        reportingDomain: record.reportingDomain,
        severity: record.severity,
        impactScore: record.impactScore,
        likelihoodScore: record.likelihoodScore,
        compositeRiskScore: record.compositeRiskScore,
        title: record.title,
        description: record.description,
        evidenceRequired: record.evidenceRequired,
        evidenceProvided: record.evidenceProvided,
        evidenceMissing: record.evidenceMissing,
        deterministicHash: record.deterministicHash,
        identifiedAt: record.identifiedAt,
      });
    });
  }

  async listFindingsByProvider(ctx: TenantContext, providerId: string): Promise<FindingRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const findings = await tx.finding.findMany({
        where: { providerId },
        orderBy: { identifiedAt: 'desc' },
      });

      return findings.map((finding) =>
        toFindingRecord({
          id: finding.id,
          tenantId: finding.tenantId,
          providerId: finding.providerId,
          facilityId: finding.facilityId,
          sessionId: finding.sessionId,
          regulationSectionId: finding.regulationSectionId,
          topicId: finding.topicId,
          origin: finding.origin,
          reportingDomain: finding.reportingDomain,
          severity: finding.severity,
          impactScore: finding.impactScore,
          likelihoodScore: finding.likelihoodScore,
          compositeRiskScore: finding.compositeRiskScore,
          title: finding.title,
          description: finding.description,
          evidenceRequired: finding.evidenceRequired,
          evidenceProvided: finding.evidenceProvided,
          evidenceMissing: finding.evidenceMissing,
          deterministicHash: finding.deterministicHash,
          identifiedAt: finding.identifiedAt,
        })
      );
    });
  }

  async getFindingById(ctx: TenantContext, findingId: string): Promise<FindingRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const finding = await tx.finding.findUnique({ where: { id: findingId } });
      if (!finding) return undefined;
      return toFindingRecord({
        id: finding.id,
        tenantId: finding.tenantId,
        providerId: finding.providerId,
        facilityId: finding.facilityId,
        sessionId: finding.sessionId,
        regulationSectionId: finding.regulationSectionId,
        topicId: finding.topicId,
        origin: finding.origin,
        reportingDomain: finding.reportingDomain,
        severity: finding.severity,
        impactScore: finding.impactScore,
        likelihoodScore: finding.likelihoodScore,
        compositeRiskScore: finding.compositeRiskScore,
        title: finding.title,
        description: finding.description,
        evidenceRequired: finding.evidenceRequired,
        evidenceProvided: finding.evidenceProvided,
        evidenceMissing: finding.evidenceMissing,
        deterministicHash: finding.deterministicHash,
        identifiedAt: finding.identifiedAt,
      });
    });
  }

  async createExport(
    ctx: TenantContext,
    input: {
      providerId: string;
      facilityId: string;
      sessionId: string;
      format: 'CSV' | 'PDF' | 'BLUE_OCEAN' | 'BLUE_OCEAN_BOARD' | 'BLUE_OCEAN_AUDIT';
      content: string;
      reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
      mode: 'MOCK' | 'REAL';
      reportSource: {
        type: 'cqc_upload' | 'mock';
        id: string;
        asOf: string;
      };
      snapshotId: string;
    }
  ): Promise<ExportRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const now = new Date();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
      const exportId = scopeKey(ctx, `export-${randomUUID()}`);

      const record = await tx.exportRecord.create({
        data: {
          id: exportId,
          tenantId: ctx.tenantId,
          providerId: input.providerId,
          facilityId: input.facilityId,
          sessionId: input.sessionId,
          format: input.format,
          content: input.content,
          reportingDomain: input.reportingDomain,
          mode: input.mode,
          reportSourceType: input.reportSource.type,
          reportSourceId: input.reportSource.id,
          reportSourceAsOf: input.reportSource.asOf,
          snapshotId: input.snapshotId,
          generatedAt: now,
          expiresAt,
        },
      });

      return toExportRecord({
        id: record.id,
        tenantId: record.tenantId,
        providerId: record.providerId,
        facilityId: record.facilityId,
        sessionId: record.sessionId,
        format: record.format,
        content: record.content,
        reportingDomain: record.reportingDomain,
        mode: record.mode,
        reportSourceType: record.reportSourceType,
        reportSourceId: record.reportSourceId,
        reportSourceAsOf: record.reportSourceAsOf,
        snapshotId: record.snapshotId,
        generatedAt: record.generatedAt,
        expiresAt: record.expiresAt,
      });
    });
  }

  async getExportById(ctx: TenantContext, exportId: string): Promise<ExportRecord | undefined> {
    return withTenant(ctx.tenantId, async (tx) => {
      const record = await tx.exportRecord.findUnique({ where: { id: exportId } });
      if (!record) return undefined;
      return toExportRecord({
        id: record.id,
        tenantId: record.tenantId,
        providerId: record.providerId,
        facilityId: record.facilityId,
        sessionId: record.sessionId,
        format: record.format,
        content: record.content,
        reportingDomain: record.reportingDomain,
        mode: record.mode,
        reportSourceType: record.reportSourceType,
        reportSourceId: record.reportSourceId,
        reportSourceAsOf: record.reportSourceAsOf,
        snapshotId: record.snapshotId,
        generatedAt: record.generatedAt,
        expiresAt: record.expiresAt,
      });
    });
  }

  async listExportsByProvider(
    ctx: TenantContext,
    providerId: string,
    facilityId?: string
  ): Promise<ExportRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const exports = await tx.exportRecord.findMany({
        where: {
          providerId,
          ...(facilityId ? { facilityId } : {}),
        },
        orderBy: { generatedAt: 'desc' },
      });

      return exports.map((record) =>
        toExportRecord({
          id: record.id,
          tenantId: record.tenantId,
          providerId: record.providerId,
          facilityId: record.facilityId,
          sessionId: record.sessionId,
          format: record.format,
          content: record.content,
          reportingDomain: record.reportingDomain,
          mode: record.mode,
          reportSourceType: record.reportSourceType,
          reportSourceId: record.reportSourceId,
          reportSourceAsOf: record.reportSourceAsOf,
          snapshotId: record.snapshotId,
          generatedAt: record.generatedAt,
          expiresAt: record.expiresAt,
        })
      );
    });
  }

  async listAuditEvents(ctx: TenantContext, providerId: string): Promise<AuditEventRecord[]> {
    return withTenant(ctx.tenantId, async (tx) => {
      const events = await tx.auditEvent.findMany({
        where: {
          entityType: 'PROVIDER',
          entityId: providerId,
        },
        orderBy: { timestamp: 'asc' },
      });

      return events.map((event) =>
        toAuditEventRecord({
          id: event.id,
          eventType: event.eventType,
          timestamp: event.timestamp,
          actor: event.actor,
          payloadHash: event.payloadHash,
          previousEventHash: event.previousEventHash,
          eventHash: event.eventHash,
        })
      );
    });
  }

  async appendAuditEvent(
    ctx: TenantContext,
    providerId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<AuditEventRecord> {
    return withTenant(ctx.tenantId, async (tx) => {
      const lastEvent = await tx.auditEvent.findFirst({
        where: {
          entityType: 'PROVIDER',
          entityId: providerId,
        },
        orderBy: { timestamp: 'desc' },
      });

      const previousEventHash = lastEvent?.eventHash ?? undefined;
      const payloadHash = computeHash(payload);
      const timestamp = new Date();

      const eventBody = {
        eventType,
        payloadHash,
        previousEventHash,
        timestamp: timestamp.toISOString(),
        userId: ctx.actorId,
      };

      const eventHash = computeHash(eventBody);
      const eventId = scopeKey(ctx, `event-${randomUUID()}`);

      const record = await tx.auditEvent.create({
        data: {
          id: eventId,
          tenantId: ctx.tenantId,
          eventType,
          entityType: 'PROVIDER',
          entityId: providerId,
          actor: ctx.actorId,
          payload,
          payloadHash,
          previousEventHash: previousEventHash ?? null,
          eventHash,
          timestamp,
        },
      });

      return toAuditEventRecord({
        id: record.id,
        eventType: record.eventType,
        timestamp: record.timestamp,
        actor: record.actor,
        payloadHash: record.payloadHash,
        previousEventHash: record.previousEventHash,
        eventHash: record.eventHash,
      });
    });
  }
}
