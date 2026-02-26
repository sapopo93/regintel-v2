import { createHash } from 'node:crypto';
import { createFacility } from '@regintel/domain/facility';
import { computeBlobHash } from '@regintel/domain/evidence';
import { TenantIsolatedStore, scopeKey, unscopeKey } from '@regintel/security/tenant';

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

export interface TenantContext {
  tenantId: string;
  actorId: string;
}

export class InMemoryStore {
  private providers = new TenantIsolatedStore<ProviderRecord>();
  private facilities = new TenantIsolatedStore<FacilityRecord>();
  private evidenceBlobs = new TenantIsolatedStore<EvidenceBlobRecord>();
  private evidenceRecords = new TenantIsolatedStore<EvidenceRecordRecord>();
  private sessions = new TenantIsolatedStore<MockSessionRecord>();
  private findings = new TenantIsolatedStore<FindingRecord>();
  private exports = new TenantIsolatedStore<ExportRecord>();
  private audits = new TenantIsolatedStore<AuditEventRecord[]>();

  private counters = new Map<string, Record<string, number>>();
  private facilityIndex = new Map<string, string>();
  private facilitiesByProvider = new Map<string, string[]>();
  private evidenceByFacility = new Map<string, string[]>();
  private sessionsByProvider = new Map<string, string[]>();
  private findingsByProvider = new Map<string, string[]>();

  private nextSequence(ctx: TenantContext, key: string): number {
    const tenantCounters = this.counters.get(ctx.tenantId) ?? {};
    const nextValue = (tenantCounters[key] ?? 0) + 1;
    tenantCounters[key] = nextValue;
    this.counters.set(ctx.tenantId, tenantCounters);
    return nextValue;
  }

  /**
   * Initialize demo data for development
   * Creates a demo provider if it doesn't exist
   */
  seedDemoProvider(ctx: TenantContext): ProviderRecord | null {
    const demoId = 'provider-1';
    const scopedId = scopeKey(ctx, demoId);

    // Check if demo provider already exists
    const existing = this.providers.read(ctx, demoId);
    if (existing) {
      return existing;
    }

    // Create demo provider with fixed ID
    const now = new Date().toISOString();
    const record: ProviderRecord = {
      providerId: scopedId,
      tenantId: ctx.tenantId,
      providerName: 'Demo Care Provider',
      orgRef: 'DEMO-ORG-001',
      asOf: now,
      prsState: 'STABLE',
      registeredBeds: 50,
      serviceTypes: ['residential', 'nursing'],
      createdAt: now,
      createdBy: 'SYSTEM',
    };

    this.providers.write(ctx, demoId, record);
    this.appendAuditEvent(ctx, scopedId, 'PROVIDER_CREATED', {
      providerId: scopedId,
      source: 'SEED_DATA'
    });

    return record;
  }

  createProvider(ctx: TenantContext, input: { providerName: string; orgRef?: string }): ProviderRecord {
    const id = `provider-${this.nextSequence(ctx, 'provider')}`;
    const providerId = scopeKey(ctx, id);
    const now = new Date().toISOString();

    const record: ProviderRecord = {
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
    };

    this.providers.write(ctx, id, record);
    return record;
  }

  listProviders(ctx: TenantContext): ProviderRecord[] {
    return this.providers.listKeys(ctx)
      .map((key) => this.providers.read(ctx, key))
      .filter((record): record is ProviderRecord => Boolean(record));
  }

  getProviderById(ctx: TenantContext, providerId: string): ProviderRecord | undefined {
    return this.providers.readByKey(ctx, providerId);
  }

  createFacility(ctx: TenantContext, input: {
    providerId: string;
    facilityName: string;
    addressLine1: string;
    townCity: string;
    postcode: string;
    cqcLocationId: string;
    serviceType: string;
    capacity?: number;
  }): FacilityRecord {
    const provider = this.getProviderById(ctx, input.providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const normalizedCqc = input.cqcLocationId.trim().toUpperCase();
    const indexKey = `${input.providerId}::${normalizedCqc}`;
    if (this.facilityIndex.has(indexKey)) {
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

    const record: FacilityRecord = {
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
      capacity: domainFacility.capacity,
      facilityHash: domainFacility.facilityHash,
      createdAt: domainFacility.createdAt,
      createdBy: domainFacility.createdBy,
      asOf: domainFacility.createdAt,
      // Default to manual data source for legacy createFacility
      dataSource: 'MANUAL',
      cqcSyncedAt: null,
      inspectionStatus: 'PENDING_FIRST_INSPECTION',
    };

    this.facilities.write(ctx, id, record);
    this.facilityIndex.set(indexKey, record.id);

    const facilityList = this.facilitiesByProvider.get(record.providerId) ?? [];
    facilityList.push(record.id);
    this.facilitiesByProvider.set(record.providerId, facilityList);

    const providerKey = unscopeKey(ctx, record.providerId);
    if (providerKey) {
      const providerRecord = this.providers.read(ctx, providerKey);
      if (providerRecord) {
        const updatedServiceTypes = providerRecord.serviceTypes.includes(record.serviceType)
          ? providerRecord.serviceTypes
          : [...providerRecord.serviceTypes, record.serviceType];
        const updatedBeds = facilityList
          .map((facilityId) => this.facilities.readByKey(ctx, facilityId))
          .filter((facility): facility is FacilityRecord => Boolean(facility))
          .reduce((total, facility) => total + (facility.capacity ?? 0), 0);

        this.providers.write(ctx, providerKey, {
          ...providerRecord,
          serviceTypes: updatedServiceTypes,
          registeredBeds: updatedBeds,
        });
      }
    }

    return record;
  }

  listFacilitiesByProvider(ctx: TenantContext, providerId: string): FacilityRecord[] {
    const ids = this.facilitiesByProvider.get(providerId) ?? [];
    return ids.map((id) => this.facilities.readByKey(ctx, id))
      .filter((record): record is FacilityRecord => Boolean(record));
  }

  listFacilities(ctx: TenantContext): FacilityRecord[] {
    return this.facilities.listKeys(ctx)
      .map((key) => this.facilities.read(ctx, key))
      .filter((record): record is FacilityRecord => Boolean(record));
  }

  getFacilityById(ctx: TenantContext, facilityId: string): FacilityRecord | undefined {
    return this.facilities.readByKey(ctx, facilityId);
  }

  /**
   * Finds a facility by provider and CQC Location ID.
   * Used for idempotent onboarding (check if facility already exists).
   */
  getFacilityByCqcLocationId(
    ctx: TenantContext,
    providerId: string,
    cqcLocationId: string
  ): FacilityRecord | undefined {
    const normalizedCqc = cqcLocationId.trim().toUpperCase();
    const indexKey = `${providerId}::${normalizedCqc}`;
    const facilityId = this.facilityIndex.get(indexKey);

    if (!facilityId) {
      return undefined;
    }

    return this.facilities.readByKey(ctx, facilityId);
  }

  /**
   * Upserts a facility: creates if new, updates if exists.
   * Used by the onboarding flow to support re-onboarding (syncing CQC data).
   *
   * Returns the facility record and a flag indicating if it was newly created.
   */
  upsertFacility(
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
  ): { facility: FacilityRecord; isNew: boolean } {
    const provider = this.getProviderById(ctx, input.providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const normalizedCqc = input.cqcLocationId.trim().toUpperCase();
    const indexKey = `${input.providerId}::${normalizedCqc}`;
    const existingFacilityId = this.facilityIndex.get(indexKey);

    let isNew = false;
    let id: string;
    let createdAt: string;
    let createdBy: string;

    if (existingFacilityId) {
      // Update existing facility
      const existing = this.facilities.readByKey(ctx, existingFacilityId);
      if (!existing) {
        throw new Error('Facility index inconsistent');
      }
      const unscopedId = unscopeKey(ctx, existing.id);
      if (!unscopedId) {
        throw new Error('Invalid facility ID format');
      }
      id = unscopedId; // Unscoped ID
      createdAt = existing.createdAt;
      createdBy = existing.createdBy;
    } else {
      // Create new facility
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

    // Determine inspection status
    let inspectionStatus: 'NEVER_INSPECTED' | 'INSPECTED' | 'PENDING_FIRST_INSPECTION' =
      input.inspectionStatus || 'PENDING_FIRST_INSPECTION';

    // If we have a rating, they've been inspected
    if (input.latestRating && input.latestRatingDate) {
      inspectionStatus = 'INSPECTED';
    }
    // If no rating and data source is CQC_API, check if it's truly never inspected
    else if (input.dataSource === 'CQC_API' && !input.latestRating) {
      inspectionStatus = 'NEVER_INSPECTED';
    }

    const record: FacilityRecord = {
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
      capacity: domainFacility.capacity,
      facilityHash: domainFacility.facilityHash,
      createdAt,
      createdBy,
      asOf: now,
      dataSource: input.dataSource,
      cqcSyncedAt: input.cqcSyncedAt,
      latestRating: input.latestRating,
      latestRatingDate: input.latestRatingDate,
      inspectionStatus,
      lastReportScrapedAt: input.lastReportScrapedAt,
      lastScrapedReportDate: input.lastScrapedReportDate,
      lastScrapedReportUrl: input.lastScrapedReportUrl,
    };

    this.facilities.write(ctx, id, record);
    this.facilityIndex.set(indexKey, record.id);

    // Update provider's facility list if new
    if (isNew) {
      const facilityList = this.facilitiesByProvider.get(record.providerId) ?? [];
      facilityList.push(record.id);
      this.facilitiesByProvider.set(record.providerId, facilityList);
    }

    // Update provider's aggregated service types and bed count
    const providerKey = unscopeKey(ctx, record.providerId);
    if (providerKey) {
      const providerRecord = this.providers.read(ctx, providerKey);
      if (providerRecord) {
        const allFacilities = this.listFacilitiesByProvider(ctx, record.providerId);
        const updatedServiceTypes = Array.from(
          new Set(allFacilities.map((facility) => facility.serviceType))
        );
        const updatedBeds = allFacilities.reduce(
          (total, facility) => total + (facility.capacity ?? 0),
          0
        );

        this.providers.write(ctx, providerKey, {
          ...providerRecord,
          serviceTypes: updatedServiceTypes,
          registeredBeds: updatedBeds,
        });
      }
    }

    return { facility: record, isNew };
  }

  createEvidenceBlob(ctx: TenantContext, input: { contentBase64: string; mimeType: string }): EvidenceBlobRecord {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    const hashHex = computeBlobHash(buffer);
    const blobHash = `sha256:${hashHex}`;
    const now = new Date().toISOString();

    const record: EvidenceBlobRecord = {
      blobHash,
      mimeType: input.mimeType,
      sizeBytes: buffer.byteLength,
      uploadedAt: now,
    };

    this.evidenceBlobs.write(ctx, blobHash, record);
    return record;
  }

  getEvidenceBlob(ctx: TenantContext, blobHash: string): EvidenceBlobRecord | undefined {
    // Use read() which scopes the key, not readByKey() which expects already-scoped key
    return this.evidenceBlobs.read(ctx, blobHash);
  }

  createEvidenceRecord(ctx: TenantContext, input: {
    facilityId: string;
    providerId: string;
    blobHash: string;
    evidenceType: string;
    fileName: string;
    description?: string;
  }): EvidenceRecordRecord {
    const blob = this.getEvidenceBlob(ctx, input.blobHash);
    if (!blob) {
      throw new Error('Evidence blob not found');
    }

    const id = `evidence-${this.nextSequence(ctx, 'evidence')}`;
    const recordId = scopeKey(ctx, id);
    const now = new Date().toISOString();

    const record: EvidenceRecordRecord = {
      id: recordId,
      tenantId: ctx.tenantId,
      providerId: input.providerId,
      facilityId: input.facilityId,
      blobHash: input.blobHash,
      mimeType: blob.mimeType,
      sizeBytes: blob.sizeBytes,
      evidenceType: input.evidenceType,
      fileName: input.fileName,
      description: input.description,
      uploadedAt: now,
      createdBy: ctx.actorId,
    };

    this.evidenceRecords.write(ctx, id, record);
    const evidenceList = this.evidenceByFacility.get(record.facilityId) ?? [];
    evidenceList.push(record.id);
    this.evidenceByFacility.set(record.facilityId, evidenceList);

    return record;
  }

  getEvidenceRecordByContentHash(ctx: TenantContext, blobHash: string): EvidenceRecordRecord | undefined {
    const allKeys = this.evidenceRecords.listKeys(ctx);
    for (const key of allKeys) {
      const record = this.evidenceRecords.read(ctx, key);
      if (record && record.blobHash === blobHash) {
        return record;
      }
    }
    return undefined;
  }

  listEvidenceByFacility(ctx: TenantContext, facilityId: string): EvidenceRecordRecord[] {
    const ids = this.evidenceByFacility.get(facilityId) ?? [];
    return ids.map((id) => this.evidenceRecords.readByKey(ctx, id))
      .filter((record): record is EvidenceRecordRecord => Boolean(record));
  }

  listEvidenceByProvider(ctx: TenantContext, providerId: string): EvidenceRecordRecord[] {
    const facilities = this.listFacilitiesByProvider(ctx, providerId);
    const records: EvidenceRecordRecord[] = [];
    for (const facility of facilities) {
      records.push(...this.listEvidenceByFacility(ctx, facility.id));
    }
    return records;
  }

  createMockSession(ctx: TenantContext, input: {
    provider: ProviderRecord;
    facilityId: string;
    topicId: string;
    topicCatalogVersion: string;
    topicCatalogHash: string;
    prsLogicProfilesVersion: string;
    prsLogicProfilesHash: string;
  }): MockSessionRecord {
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
    return ids.map((id) => this.sessions.readByKey(ctx, id))
      .filter((record): record is MockSessionRecord => Boolean(record));
  }

  getSessionById(ctx: TenantContext, sessionId: string): MockSessionRecord | undefined {
    return this.sessions.readByKey(ctx, sessionId);
  }

  updateSession(ctx: TenantContext, session: MockSessionRecord): void {
    this.sessions.writeByKey(ctx, session.sessionId, session);
  }

  addFinding(ctx: TenantContext, input: Omit<FindingRecord, 'id' | 'tenantId' | 'deterministicHash' | 'createdAt'>): FindingRecord {
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
    return ids.map((id) => this.findings.readByKey(ctx, id))
      .filter((record): record is FindingRecord => Boolean(record));
  }

  getFindingById(ctx: TenantContext, findingId: string): FindingRecord | undefined {
    return this.findings.readByKey(ctx, findingId);
  }

  createExport(ctx: TenantContext, input: {
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
  }): ExportRecord {
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
    return this.exports.listKeys(ctx)
      .map((key) => this.exports.read(ctx, key))
      .filter((record): record is ExportRecord => Boolean(record))
      .filter((record) => record.providerId === providerId)
      .filter((record) => !facilityId || record.facilityId === facilityId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)); // Most recent first
  }

  listAuditEvents(ctx: TenantContext, providerId: string): AuditEventRecord[] {
    return this.audits.readByKey(ctx, providerId) ?? [];
  }

  appendAuditEvent(ctx: TenantContext, providerId: string, eventType: string, payload: Record<string, unknown>): AuditEventRecord {
    const events = this.listAuditEvents(ctx, providerId);
    const previousEventHash = events.length > 0 ? events[events.length - 1].eventHash : undefined;
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
    const eventId = scopeKey(ctx, `event-${events.length + 1}`);

    const record: AuditEventRecord = {
      eventId,
      eventType,
      timestamp,
      userId: ctx.actorId,
      payloadHash,
      previousEventHash,
      eventHash,
    };

    const updated = [...events, record];
    this.audits.writeByKey(ctx, providerId, updated);
    return record;
  }
}
