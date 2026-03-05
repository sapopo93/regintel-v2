import { createHash, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { createFacility } from '@regintel/domain/facility';
import { computeBlobHash } from '@regintel/domain/evidence';
import { TenantIsolatedStore, scopeKey, unscopeKey } from '@regintel/security/tenant';

const prisma = new PrismaClient();

export interface ProviderRecord {
  providerId: string;
  tenantId: string;
  providerName: string;
  orgRef?: string;
  asOf: string;
  prsState: string;
  registeredBeds: number;
  serviceTypes: string[];
  createdAt: string;
  createdBy: string;
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
  // Onboarding metadata (Phase 10)
  dataSource: 'CQC_API' | 'MANUAL';
  cqcSyncedAt: string | null;
  latestRating?: string;
  latestRatingDate?: string;
  inspectionStatus: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION';
  lastReportScrapedAt: string | null;
  lastScrapedReportDate: string | null;
  lastScrapedReportUrl: string | null;
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
  uploadedAt: string;
  createdBy: string;
}

export interface MockSessionRecord {
  sessionId: string;
  tenantId: string;
  providerId: string;
  facilityId: string;
  mode: 'MOCK';
  providerSnapshot: {
    providerId: string;
    providerName: string;
    asOf: string;
    prsState: string;
    registeredBeds: number;
    serviceTypes: string[];
  };
  topicId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  followUpsUsed: number;
  maxFollowUps: number;
  createdAt: string;
  completedAt?: string;
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicProfilesVersion: string;
  prsLogicProfilesHash: string;
}

export interface FindingRecord {
  id: string;
  tenantId: string;
  providerId: string;
  facilityId: string;
  sessionId: string;
  regulationSectionId: string;
  topicId: string;
  origin: 'SYSTEM_MOCK' | 'ACTUAL_INSPECTION' | 'SELF_IDENTIFIED';
  reportingDomain: 'MOCK_SIMULATION' | 'REGULATORY_HISTORY';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  impactScore: number;
  likelihoodScore: number;
  compositeRiskScore: number;
  title: string;
  description: string;
  evidenceRequired: string[];
  evidenceProvided: string[];
  evidenceMissing: string[];
  deterministicHash: string;
  createdAt: string;
}

export interface ExportRecord {
  id: string;
  tenantId: string;
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
  generatedAt: string;
  expiresAt: string;
}

export interface AuditEventRecord {
  eventId: string;
  eventType: string;
  timestamp: string;
  userId: string;
  payloadHash: string;
  previousEventHash?: string;
  eventHash: string;
}

interface TenantContext {
  tenantId: string;
  actorId: string;
}

export class PrismaStore {
  private providers = new TenantIsolatedStore<ProviderRecord>();
  private facilities = new TenantIsolatedStore<FacilityRecord>();
  private evidenceBlobs = new TenantIsolatedStore<EvidenceBlobRecord>();
  private evidenceRecords = new TenantIsolatedStore<EvidenceRecordRecord>();
  private sessions = new TenantIsolatedStore<MockSessionRecord>();
  private findings = new TenantIsolatedStore<FindingRecord>();
  private exports = new TenantIsolatedStore<ExportRecord>();

  private counters = new Map<string, Record<string, number>>();
  private facilityIndex = new Map<string, string>();
  private facilitiesByProvider = new Map<string, string[]>();
  private evidenceByFacility = new Map<string, string[]>();
  private sessionsByProvider = new Map<string, string[]>();
  private findingsByProvider = new Map<string, string[]>();
  private hydratePromise: Promise<void> | null = null;

  constructor() {}

  async waitForReady(): Promise<void> {
    await this.hydrate();
  }

  private toUuid(value: string): string {
    const hash = createHash('sha256').update(value).digest('hex');
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-');
  }

  private nextSequence(ctx: TenantContext, key: string): number {
    const tenantCounters = this.counters.get(ctx.tenantId) ?? {};
    const nextValue = (tenantCounters[key] ?? 0) + 1;
    tenantCounters[key] = nextValue;
    this.counters.set(ctx.tenantId, tenantCounters);
    return nextValue;
  }

  private mapProviderRecord(row: {
    id: string;
    tenantId: string;
    providerName: string;
    orgRef: string | null;
    asOf: string;
    prsState: string;
    registeredBeds: number;
    serviceTypes: string[];
    createdAt: string;
    createdBy: string;
  }): ProviderRecord {
    return {
      providerId: row.id,
      tenantId: row.tenantId,
      providerName: row.providerName,
      orgRef: row.orgRef ?? undefined,
      asOf: row.asOf,
      prsState: row.prsState,
      registeredBeds: row.registeredBeds,
      serviceTypes: row.serviceTypes,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    };
  }

  private mapFacilityRecord(row: {
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
    dataSource: string;
    cqcSyncedAt: string | null;
    latestRating: string | null;
    latestRatingDate: string | null;
    inspectionStatus: string;
    lastReportScrapedAt: string | null;
    lastScrapedReportDate: string | null;
    lastScrapedReportUrl: string | null;
    createdAt: string;
    createdBy: string;
    asOf: string;
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
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      asOf: row.asOf,
      dataSource: row.dataSource as 'CQC_API' | 'MANUAL',
      cqcSyncedAt: row.cqcSyncedAt,
      latestRating: row.latestRating ?? undefined,
      latestRatingDate: row.latestRatingDate ?? undefined,
      inspectionStatus: row.inspectionStatus as
        | 'NEVER_INSPECTED'
        | 'INSPECTED'
        | 'PENDING_FIRST_INSPECTION',
      lastReportScrapedAt: row.lastReportScrapedAt,
      lastScrapedReportDate: row.lastScrapedReportDate,
      lastScrapedReportUrl: row.lastScrapedReportUrl,
    };
  }

  private getEvidenceMetadata(metadata: unknown): {
    tenantId?: string;
    providerId?: string;
    facilityId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    createdBy?: string;
  } {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    const meta = metadata as Record<string, unknown>;
    return {
      tenantId: typeof meta.tenantId === 'string' ? meta.tenantId : undefined,
      providerId: typeof meta.providerId === 'string' ? meta.providerId : undefined,
      facilityId: typeof meta.facilityId === 'string' ? meta.facilityId : undefined,
      fileName: typeof meta.fileName === 'string' ? meta.fileName : undefined,
      mimeType: typeof meta.mimeType === 'string' ? meta.mimeType : undefined,
      sizeBytes: typeof meta.sizeBytes === 'number' ? meta.sizeBytes : undefined,
      createdBy: typeof meta.createdBy === 'string' ? meta.createdBy : undefined,
    };
  }

  private mapEvidenceRecord(
    row: {
      id: string;
      tenantId: string;
      contentHash: string;
      evidenceType: string;
      title: string;
      description: string | null;
      collectedAt: Date;
      metadata: unknown;
      createdBy: string;
    },
    tenantFallback?: string
  ): EvidenceRecordRecord {
    const metadata = this.getEvidenceMetadata(row.metadata);

    return {
      id: row.id,
      tenantId: metadata.tenantId ?? tenantFallback ?? row.tenantId,
      providerId: metadata.providerId ?? '',
      facilityId: metadata.facilityId ?? '',
      blobHash: row.contentHash,
      mimeType: metadata.mimeType ?? 'application/octet-stream',
      sizeBytes: metadata.sizeBytes ?? 0,
      evidenceType: row.evidenceType,
      fileName: metadata.fileName ?? row.title,
      description: row.description ?? undefined,
      uploadedAt: row.collectedAt.toISOString(),
      createdBy: metadata.createdBy ?? row.createdBy,
    };
  }

  private mapAuditEvent(row: {
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

  private async syncProviderAggregates(ctx: TenantContext, providerId: string): Promise<void> {
    const facilities = await prisma.facility.findMany({
      where: { tenantId: ctx.tenantId, providerId },
    });

    const serviceTypes = Array.from(new Set(facilities.map((facility) => facility.serviceType)));
    const registeredBeds = facilities.reduce((total, facility) => total + (facility.capacity ?? 0), 0);

    await prisma.provider.update({
      where: { id: providerId },
      data: {
        serviceTypes,
        registeredBeds,
        asOf: new Date().toISOString(),
      },
    });
  }

  async hydrate(): Promise<void> {
    if (!this.hydratePromise) {
      this.hydratePromise = this.performHydrate();
    }
    await this.hydratePromise;
  }

  private async performHydrate(): Promise<void> {
    const [dbProviders, dbFacilities] = await Promise.all([
      prisma.provider.findMany(),
      prisma.facility.findMany(),
    ]);

    for (const row of dbProviders) {
      const ctx: TenantContext = { tenantId: row.tenantId, actorId: row.createdBy };
      const unscopedId = unscopeKey(ctx, row.id);
      if (!unscopedId) {
        continue;
      }

      this.providers.write(ctx, unscopedId, this.mapProviderRecord(row));

      const providerMatch = unscopedId.match(/^provider-(\d+)$/);
      if (providerMatch) {
        const sequence = Number.parseInt(providerMatch[1], 10);
        const tenantCounters = this.counters.get(row.tenantId) ?? {};
        tenantCounters.provider = Math.max(tenantCounters.provider ?? 0, sequence);
        this.counters.set(row.tenantId, tenantCounters);
      }
    }

    for (const row of dbFacilities) {
      const ctx: TenantContext = { tenantId: row.tenantId, actorId: row.createdBy };
      const unscopedId = unscopeKey(ctx, row.id);
      if (!unscopedId) {
        continue;
      }

      this.facilities.write(ctx, unscopedId, this.mapFacilityRecord(row));
      this.facilityIndex.set(`${row.providerId}::${row.cqcLocationId.trim().toUpperCase()}`, row.id);

      const providerFacilities = this.facilitiesByProvider.get(row.providerId) ?? [];
      if (!providerFacilities.includes(row.id)) {
        providerFacilities.push(row.id);
        this.facilitiesByProvider.set(row.providerId, providerFacilities);
      }

      const facilityMatch = unscopedId.match(/^facility-(\d+)$/);
      if (facilityMatch) {
        const sequence = Number.parseInt(facilityMatch[1], 10);
        const tenantCounters = this.counters.get(row.tenantId) ?? {};
        tenantCounters.facility = Math.max(tenantCounters.facility ?? 0, sequence);
        this.counters.set(row.tenantId, tenantCounters);
      }
    }

    console.log(`[PrismaStore] Hydrated ${dbProviders.length} providers, ${dbFacilities.length} facilities`);
  }

  async seedDemoProvider(ctx: TenantContext): Promise<ProviderRecord | null> {
    const demoId = 'provider-1';
    const scopedId = scopeKey(ctx, demoId);

    const existing = await prisma.provider.findUnique({ where: { id: scopedId } });

    const now = new Date().toISOString();
    const row = await prisma.provider.upsert({
      where: { id: scopedId },
      create: {
        id: scopedId,
        tenantId: ctx.tenantId,
        providerName: 'Demo Care Provider',
        orgRef: 'DEMO-ORG-001',
        asOf: now,
        prsState: 'STABLE',
        registeredBeds: 50,
        serviceTypes: ['residential', 'nursing'],
        createdAt: now,
        createdBy: 'SYSTEM',
      },
      update: {},
    });

    const record = this.mapProviderRecord(row);
    this.providers.write(ctx, demoId, record);

    if (!existing) {
      await this.appendAuditEvent(ctx, scopedId, 'PROVIDER_CREATED', {
        providerId: scopedId,
        source: 'SEED_DATA',
      });
    }

    return record;
  }

  async createProvider(
    ctx: TenantContext,
    input: { providerName: string; orgRef?: string }
  ): Promise<ProviderRecord> {
    const id = `provider-${this.nextSequence(ctx, 'provider')}`;
    const providerId = scopeKey(ctx, id);
    const now = new Date().toISOString();

    const row = await prisma.provider.create({
      data: {
        id: providerId,
        tenantId: ctx.tenantId,
        providerName: input.providerName,
        orgRef: input.orgRef ?? null,
        asOf: now,
        prsState: 'ESTABLISHED',
        registeredBeds: 0,
        serviceTypes: [],
        createdAt: now,
        createdBy: ctx.actorId,
      },
    });

    const record = this.mapProviderRecord(row);
    this.providers.write(ctx, id, record);
    return record;
  }

  async listProviders(ctx: TenantContext): Promise<ProviderRecord[]> {
    const rows = await prisma.provider.findMany({ where: { tenantId: ctx.tenantId } });
    return rows.map((row) => this.mapProviderRecord(row));
  }

  async getProviderById(ctx: TenantContext, providerId: string): Promise<ProviderRecord | undefined> {
    const row = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!row || row.tenantId !== ctx.tenantId) {
      return undefined;
    }
    return this.mapProviderRecord(row);
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
    const provider = await this.getProviderById(ctx, input.providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const normalizedCqc = input.cqcLocationId.trim().toUpperCase();
    const existing = await this.getFacilityByCqcLocationId(ctx, input.providerId, normalizedCqc);
    if (existing) {
      throw new Error('Facility with this CQC Location ID already exists for provider');
    }

    const id = `facility-${this.nextSequence(ctx, 'facility')}`;
    const address = `${input.addressLine1.trim()}, ${input.townCity.trim()}, ${input.postcode.trim()}`;

    const domainFacility = createFacility({
      id,
      tenantId: ctx.tenantId,
      providerId: input.providerId,
      facilityName: input.facilityName,
      address,
      cqcLocationId: normalizedCqc,
      serviceType: input.serviceType,
      capacity: input.capacity,
      createdBy: ctx.actorId,
    });

    const row = await prisma.facility.create({
      data: {
        id: domainFacility.id,
        tenantId: domainFacility.tenantId,
        providerId: domainFacility.providerId,
        facilityName: domainFacility.facilityName,
        addressLine1: input.addressLine1,
        townCity: input.townCity,
        postcode: input.postcode,
        address: domainFacility.address,
        cqcLocationId: domainFacility.cqcLocationId,
        serviceType: domainFacility.serviceType,
        capacity: domainFacility.capacity ?? null,
        facilityHash: domainFacility.facilityHash,
        dataSource: 'MANUAL',
        cqcSyncedAt: null,
        latestRating: null,
        latestRatingDate: null,
        inspectionStatus: 'PENDING_FIRST_INSPECTION',
        lastReportScrapedAt: null,
        lastScrapedReportDate: null,
        lastScrapedReportUrl: null,
        createdAt: domainFacility.createdAt,
        createdBy: domainFacility.createdBy,
        asOf: domainFacility.createdAt,
      },
    });

    await this.syncProviderAggregates(ctx, input.providerId);

    const record = this.mapFacilityRecord(row);
    this.facilities.write(ctx, id, record);
    this.facilityIndex.set(`${record.providerId}::${record.cqcLocationId}`, record.id);

    const list = this.facilitiesByProvider.get(record.providerId) ?? [];
    if (!list.includes(record.id)) {
      list.push(record.id);
      this.facilitiesByProvider.set(record.providerId, list);
    }

    return record;
  }

  async listFacilitiesByProvider(ctx: TenantContext, providerId: string): Promise<FacilityRecord[]> {
    const rows = await prisma.facility.findMany({ where: { tenantId: ctx.tenantId, providerId } });
    return rows.map((row) => this.mapFacilityRecord(row));
  }

  async listFacilities(ctx: TenantContext): Promise<FacilityRecord[]> {
    const rows = await prisma.facility.findMany({ where: { tenantId: ctx.tenantId } });
    return rows.map((row) => this.mapFacilityRecord(row));
  }

  async getFacilityById(ctx: TenantContext, facilityId: string): Promise<FacilityRecord | undefined> {
    const row = await prisma.facility.findUnique({ where: { id: facilityId } });
    if (!row || row.tenantId !== ctx.tenantId) {
      return undefined;
    }
    return this.mapFacilityRecord(row);
  }

  async getFacilityByCqcLocationId(
    ctx: TenantContext,
    providerId: string,
    cqcLocationId: string
  ): Promise<FacilityRecord | undefined> {
    const normalizedCqc = cqcLocationId.trim().toUpperCase();

    const row = await prisma.facility.findFirst({
      where: {
        tenantId: ctx.tenantId,
        providerId,
        cqcLocationId: normalizedCqc,
      },
    });

    return row ? this.mapFacilityRecord(row) : undefined;
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
      lastScrapedReportDate?: string | null;
      lastScrapedReportUrl?: string | null;
    }
  ): Promise<{ facility: FacilityRecord; isNew: boolean }> {
    const provider = await this.getProviderById(ctx, input.providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const normalizedCqc = input.cqcLocationId.trim().toUpperCase();
    const existing = await this.getFacilityByCqcLocationId(ctx, input.providerId, normalizedCqc);

    let isNew = false;
    let id: string;
    let createdAt: string;
    let createdBy: string;

    if (existing) {
      const unscopedId = unscopeKey(ctx, existing.id);
      if (!unscopedId) {
        throw new Error('Invalid facility ID format');
      }
      id = unscopedId;
      createdAt = existing.createdAt;
      createdBy = existing.createdBy;
    } else {
      isNew = true;
      id = `facility-${this.nextSequence(ctx, 'facility')}`;
      createdAt = new Date().toISOString();
      createdBy = ctx.actorId;
    }

    const address = `${input.addressLine1.trim()}, ${input.townCity.trim()}, ${input.postcode.trim()}`;
    const domainFacility = createFacility({
      id,
      tenantId: ctx.tenantId,
      providerId: input.providerId,
      facilityName: input.facilityName,
      address,
      cqcLocationId: normalizedCqc,
      serviceType: input.serviceType,
      capacity: input.capacity,
      createdBy,
    });

    const now = new Date().toISOString();

    let inspectionStatus: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION' =
      input.inspectionStatus || 'PENDING_FIRST_INSPECTION';

    if (input.latestRating && input.latestRatingDate) {
      inspectionStatus = 'INSPECTED';
    } else if (input.dataSource === 'CQC_API' && !input.latestRating) {
      inspectionStatus = 'NEVER_INSPECTED';
    }

    const row = await prisma.facility.upsert({
      where: { id: domainFacility.id },
      create: {
        id: domainFacility.id,
        tenantId: domainFacility.tenantId,
        providerId: domainFacility.providerId,
        facilityName: domainFacility.facilityName,
        addressLine1: input.addressLine1.trim(),
        townCity: input.townCity.trim(),
        postcode: input.postcode.trim(),
        address: domainFacility.address,
        cqcLocationId: domainFacility.cqcLocationId,
        serviceType: domainFacility.serviceType,
        capacity: domainFacility.capacity ?? null,
        facilityHash: domainFacility.facilityHash,
        dataSource: input.dataSource,
        cqcSyncedAt: input.cqcSyncedAt,
        latestRating: input.latestRating ?? null,
        latestRatingDate: input.latestRatingDate ?? null,
        inspectionStatus,
        lastReportScrapedAt: input.lastReportScrapedAt ?? null,
        lastScrapedReportDate: input.lastScrapedReportDate ?? null,
        lastScrapedReportUrl: input.lastScrapedReportUrl ?? null,
        createdAt,
        createdBy,
        asOf: now,
      },
      update: {
        providerId: domainFacility.providerId,
        facilityName: domainFacility.facilityName,
        addressLine1: input.addressLine1.trim(),
        townCity: input.townCity.trim(),
        postcode: input.postcode.trim(),
        address: domainFacility.address,
        cqcLocationId: domainFacility.cqcLocationId,
        serviceType: domainFacility.serviceType,
        capacity: domainFacility.capacity ?? null,
        facilityHash: domainFacility.facilityHash,
        dataSource: input.dataSource,
        cqcSyncedAt: input.cqcSyncedAt,
        latestRating: input.latestRating ?? null,
        latestRatingDate: input.latestRatingDate ?? null,
        inspectionStatus,
        lastReportScrapedAt: input.lastReportScrapedAt ?? null,
        lastScrapedReportDate: input.lastScrapedReportDate ?? null,
        lastScrapedReportUrl: input.lastScrapedReportUrl ?? null,
        asOf: now,
      },
    });

    await this.syncProviderAggregates(ctx, input.providerId);

    const facility = this.mapFacilityRecord(row);
    this.facilityIndex.set(`${facility.providerId}::${facility.cqcLocationId}`, facility.id);

    const list = this.facilitiesByProvider.get(facility.providerId) ?? [];
    if (!list.includes(facility.id)) {
      list.push(facility.id);
      this.facilitiesByProvider.set(facility.providerId, list);
    }

    return { facility, isNew };
  }

  async createEvidenceBlob(
    _ctx: TenantContext,
    input: { contentBase64: string; mimeType: string }
  ): Promise<EvidenceBlobRecord> {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    const blobHash = `sha256:${computeBlobHash(buffer)}`;

    const row = await prisma.evidenceBlob.upsert({
      where: { contentHash: blobHash },
      create: {
        contentHash: blobHash,
        contentType: input.mimeType,
        sizeBytes: BigInt(buffer.byteLength),
        storagePath: '',
      },
      update: {},
    });

    const record: EvidenceBlobRecord = {
      blobHash: row.contentHash,
      mimeType: row.contentType,
      sizeBytes: Number(row.sizeBytes),
      uploadedAt: row.uploadedAt.toISOString(),
    };

    return record;
  }

  async getEvidenceBlob(_ctx: TenantContext, blobHash: string): Promise<EvidenceBlobRecord | undefined> {
    const record = await prisma.evidenceBlob.findUnique({ where: { contentHash: blobHash } });
    if (!record) return undefined;
    return {
      blobHash: record.contentHash,
      mimeType: record.contentType,
      sizeBytes: Number(record.sizeBytes),
      uploadedAt: record.uploadedAt.toISOString(),
    };
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
    }
  ): Promise<EvidenceRecordRecord> {
    const blob = await this.getEvidenceBlob(ctx, input.blobHash);
    if (!blob) {
      throw new Error('Evidence blob not found');
    }

    const id = randomUUID();
    const tenantUuid = this.toUuid(ctx.tenantId);

    const row = await prisma.evidenceRecord.create({
      data: {
        id,
        tenantId: tenantUuid,
        contentHash: input.blobHash,
        evidenceType: input.evidenceType,
        title: input.fileName,
        description: input.description,
        collectedAt: new Date(blob.uploadedAt),
        metadata: {
          providerId: input.providerId,
          facilityId: input.facilityId,
          fileName: input.fileName,
          mimeType: blob.mimeType,
          sizeBytes: blob.sizeBytes,
          createdBy: ctx.actorId,
        },
        createdBy: ctx.actorId,
      },
    });

    const record = this.mapEvidenceRecord(row, ctx.tenantId);
    const key = unscopeKey(ctx, record.id) ?? record.id;
    this.evidenceRecords.write(ctx, key, record);

    const evidenceList = this.evidenceByFacility.get(record.facilityId) ?? [];
    evidenceList.push(record.id);
    this.evidenceByFacility.set(record.facilityId, evidenceList);

    return record;
  }

  async getEvidenceRecordByContentHash(
    ctx: TenantContext,
    blobHash: string
  ): Promise<EvidenceRecordRecord | undefined> {
    const row = await prisma.evidenceRecord.findFirst({
      where: {
        contentHash: blobHash,
        tenantId: this.toUuid(ctx.tenantId),
      },
      orderBy: { createdAt: 'desc' },
    });

    return row ? this.mapEvidenceRecord(row, ctx.tenantId) : undefined;
  }

  async listEvidenceByFacility(ctx: TenantContext, facilityId: string): Promise<EvidenceRecordRecord[]> {
    const records = await prisma.evidenceRecord.findMany({
      where: { tenantId: this.toUuid(ctx.tenantId) },
      include: { blob: true },
      orderBy: { createdAt: 'asc' },
    });

    return records
      .filter((record) => (record.metadata as any)?.facilityId === facilityId)
      .map((record) => ({
        id: record.id,
        tenantId: ctx.tenantId,
        providerId: (record.metadata as any)?.providerId ?? '',
        facilityId: (record.metadata as any)?.facilityId ?? '',
        blobHash: record.contentHash,
        mimeType: (record.metadata as any)?.mimeType ?? record.blob?.contentType ?? '',
        sizeBytes: Number(record.blob?.sizeBytes ?? (record.metadata as any)?.sizeBytes ?? 0),
        evidenceType: record.evidenceType,
        fileName: record.title,
        description: record.description ?? undefined,
        uploadedAt: record.collectedAt.toISOString(),
        createdBy: record.createdBy,
      }));
  }

  async listEvidenceByProvider(ctx: TenantContext, providerId: string): Promise<EvidenceRecordRecord[]> {
    const facilities = await this.listFacilitiesByProvider(ctx, providerId);
    const records: EvidenceRecordRecord[] = [];

    for (const facility of facilities) {
      const facilityEvidence = await this.listEvidenceByFacility(ctx, facility.id);
      records.push(...facilityEvidence);
    }

    return records;
  }

  createMockSession(
    ctx: TenantContext,
    input: {
      provider: ProviderRecord;
      facilityId: string;
      topicId: string;
      topicCatalogVersion: string;
      topicCatalogHash: string;
      prsLogicProfilesVersion: string;
      prsLogicProfilesHash: string;
    }
  ): MockSessionRecord {
    const id = `session-${this.nextSequence(ctx, 'session')}`;
    const sessionId = scopeKey(ctx, id);
    const now = new Date().toISOString();

    const record: MockSessionRecord = {
      sessionId,
      tenantId: ctx.tenantId,
      providerId: input.provider.providerId,
      facilityId: input.facilityId,
      mode: 'MOCK',
      providerSnapshot: {
        providerId: input.provider.providerId,
        providerName: input.provider.providerName,
        asOf: input.provider.asOf,
        prsState: input.provider.prsState,
        registeredBeds: input.provider.registeredBeds,
        serviceTypes: input.provider.serviceTypes,
      },
      topicId: input.topicId,
      status: 'IN_PROGRESS',
      followUpsUsed: 0,
      maxFollowUps: 4,
      createdAt: now,
      topicCatalogVersion: input.topicCatalogVersion,
      topicCatalogHash: input.topicCatalogHash,
      prsLogicProfilesVersion: input.prsLogicProfilesVersion,
      prsLogicProfilesHash: input.prsLogicProfilesHash,
    };

    this.sessions.write(ctx, id, record);

    const sessions = this.sessionsByProvider.get(input.provider.providerId) ?? [];
    sessions.push(record.sessionId);
    this.sessionsByProvider.set(input.provider.providerId, sessions);

    return record;
  }

  listSessionsByProvider(ctx: TenantContext, providerId: string): MockSessionRecord[] {
    const ids = this.sessionsByProvider.get(providerId) ?? [];
    return ids
      .map((id) => this.sessions.readByKey(ctx, id))
      .filter((record): record is MockSessionRecord => Boolean(record));
  }

  getSessionById(ctx: TenantContext, sessionId: string): MockSessionRecord | undefined {
    return this.sessions.readByKey(ctx, sessionId);
  }

  updateSession(ctx: TenantContext, session: MockSessionRecord): void {
    this.sessions.writeByKey(ctx, session.sessionId, session);
  }

  addFinding(
    ctx: TenantContext,
    input: Omit<FindingRecord, 'id' | 'tenantId' | 'deterministicHash' | 'createdAt'>
  ): FindingRecord {
    const id = `finding-${this.nextSequence(ctx, 'finding')}`;
    const findingId = scopeKey(ctx, id);
    const now = new Date().toISOString();

    const payload = {
      ...input,
      createdAt: now,
    };

    const deterministicHash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;

    const record: FindingRecord = {
      id: findingId,
      tenantId: ctx.tenantId,
      deterministicHash,
      createdAt: now,
      ...input,
    };

    this.findings.write(ctx, id, record);

    const list = this.findingsByProvider.get(record.providerId) ?? [];
    list.push(record.id);
    this.findingsByProvider.set(record.providerId, list);

    return record;
  }

  listFindingsByProvider(ctx: TenantContext, providerId: string): FindingRecord[] {
    const ids = this.findingsByProvider.get(providerId) ?? [];
    return ids
      .map((id) => this.findings.readByKey(ctx, id))
      .filter((record): record is FindingRecord => Boolean(record));
  }

  getFindingById(ctx: TenantContext, findingId: string): FindingRecord | undefined {
    return this.findings.readByKey(ctx, findingId);
  }

  createExport(
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
  ): ExportRecord {
    const id = `export-${this.nextSequence(ctx, 'export')}`;
    const exportId = scopeKey(ctx, id);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

    const record: ExportRecord = {
      id: exportId,
      tenantId: ctx.tenantId,
      providerId: input.providerId,
      facilityId: input.facilityId,
      sessionId: input.sessionId,
      format: input.format,
      content: input.content,
      reportingDomain: input.reportingDomain,
      mode: input.mode,
      reportSource: input.reportSource,
      snapshotId: input.snapshotId,
      generatedAt: now,
      expiresAt,
    };

    this.exports.write(ctx, id, record);
    return record;
  }

  getExportById(ctx: TenantContext, exportId: string): ExportRecord | undefined {
    return this.exports.readByKey(ctx, exportId);
  }

  listExportsByProvider(ctx: TenantContext, providerId: string, facilityId?: string): ExportRecord[] {
    return this.exports
      .listKeys(ctx)
      .map((key) => this.exports.read(ctx, key))
      .filter((record): record is ExportRecord => Boolean(record))
      .filter((record) => record.providerId === providerId)
      .filter((record) => !facilityId || record.facilityId === facilityId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }

  async listAuditEvents(ctx: TenantContext, providerId: string): Promise<AuditEventRecord[]> {
    const rows = await prisma.auditEvent.findMany({
      where: {
        tenantId: this.toUuid(ctx.tenantId),
        entityId: providerId,
      },
      orderBy: { timestamp: 'asc' },
    });

    return rows.map((row) => this.mapAuditEvent(row));
  }

  async appendAuditEvent(
    ctx: TenantContext,
    providerId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<AuditEventRecord> {
    const tenantUuid = this.toUuid(ctx.tenantId);

    const previous = await prisma.auditEvent.findFirst({
      where: {
        tenantId: tenantUuid,
        entityId: providerId,
      },
      orderBy: { timestamp: 'desc' },
    });

    const previousEventHash = previous?.eventHash;
    const payloadHash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
    const timestamp = new Date().toISOString();

    const eventBody = {
      eventType,
      payloadHash,
      previousEventHash,
      timestamp,
      userId: ctx.actorId,
    };

    const eventHash = `sha256:${createHash('sha256').update(JSON.stringify(eventBody)).digest('hex')}`;

    const row = await prisma.auditEvent.create({
      data: {
        tenantId: tenantUuid,
        eventType,
        entityType: 'PROVIDER',
        entityId: providerId,
        actor: ctx.actorId,
        payload: payload as Prisma.InputJsonValue,
        payloadHash,
        previousEventHash,
        eventHash,
        timestamp: new Date(timestamp),
      },
    });

    return this.mapAuditEvent(row);
  }
}

export { PrismaStore as InMemoryStore };
export const store = new PrismaStore();
export type { TenantContext };
