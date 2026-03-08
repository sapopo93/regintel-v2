/**
 * PrismaStore — PostgreSQL-backed store for all entity persistence.
 *
 * Strategy: write-through cache.
 * - On startup: hydrate InMemoryStore from Postgres (call waitForReady() before serving traffic).
 * - On writes: update InMemoryStore synchronously (so callers get immediate results),
 *   then persist to Postgres asynchronously (fire-and-forget with error logging).
 */

import { PrismaClient } from '@prisma/client';
import {
  InMemoryStore,
  type TenantContext,
  type ProviderRecord,
  type FacilityRecord,
  type MockSessionRecord,
  type FindingRecord,
  type EvidenceBlobRecord,
  type EvidenceRecordRecord,
  type ExportRecord,
  type AuditEventRecord,
} from './store';
import { scopeKey, unscopeKey } from '@regintel/security/tenant';

const prisma = new PrismaClient();

export class PrismaStore extends InMemoryStore {
  private hydratePromise: Promise<void>;

  constructor() {
    super();
    console.log('[PrismaStore] Using PostgreSQL for all entity persistence');
    this.hydratePromise = this.hydrate();
  }

  /**
   * Blocks until DB hydration is complete.
   * Call this before the HTTP server starts accepting traffic.
   */
  async waitForReady(): Promise<void> {
    await this.hydratePromise;
  }

  private advanceCounter(counters: Map<string, Record<string, number>>, tenantId: string, key: string, seq: number): void {
    const tc = counters.get(tenantId) ?? {};
    tc[key] = Math.max(tc[key] ?? 0, seq);
    counters.set(tenantId, tc);
  }

  private async hydrate(): Promise<void> {
    try {
      // Access parent's private stores via runtime cast (TypeScript private is compile-time only)
      const providersStore = (this as any).providers;
      const facilitiesStore = (this as any).facilities;
      const sessionsStore = (this as any).sessions;
      const findingsStore = (this as any).findings;
      const evidenceBlobsStore = (this as any).evidenceBlobs;
      const evidenceRecordsStore = (this as any).evidenceRecords;
      const exportsStore = (this as any).exports;
      const auditsStore = (this as any).audits;
      const counters = (this as any).counters as Map<string, Record<string, number>>;
      const facilityIndex = (this as any).facilityIndex as Map<string, string>;
      const facilitiesByProvider = (this as any).facilitiesByProvider as Map<string, string[]>;
      const sessionsByProvider = (this as any).sessionsByProvider as Map<string, string[]>;
      const findingsByProvider = (this as any).findingsByProvider as Map<string, string[]>;
      const evidenceByFacility = (this as any).evidenceByFacility as Map<string, string[]>;

      // --- Hydrate Providers ---
      const dbProviders = await (prisma as any).provider.findMany();
      for (const row of dbProviders) {
        const ctx: TenantContext = { tenantId: row.tenantId, actorId: row.createdBy };
        const unscopedId = unscopeKey(ctx, row.id);
        if (!unscopedId) continue;

        const record: ProviderRecord = {
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
        providersStore.write(ctx, unscopedId, record);

        const match = unscopedId.match(/^provider-(\d+)$/);
        if (match) this.advanceCounter(counters, row.tenantId, 'provider', parseInt(match[1], 10));
      }

      // --- Hydrate Facilities ---
      const dbFacilities = await (prisma as any).facility.findMany();
      for (const row of dbFacilities) {
        const ctx: TenantContext = { tenantId: row.tenantId, actorId: row.createdBy };
        const unscopedId = unscopeKey(ctx, row.id);
        if (!unscopedId) continue;

        const record: FacilityRecord = {
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
          cqcSyncedAt: row.cqcSyncedAt ?? null,
          latestRating: row.latestRating ?? undefined,
          latestRatingDate: row.latestRatingDate ?? undefined,
          inspectionStatus: row.inspectionStatus as
            | 'NEVER_INSPECTED'
            | 'INSPECTED'
            | 'PENDING_FIRST_INSPECTION',
          lastReportScrapedAt: row.lastReportScrapedAt ?? null,
          lastScrapedReportDate: row.lastScrapedReportDate ?? undefined,
          lastScrapedReportUrl: row.lastScrapedReportUrl ?? undefined,
        };
        facilitiesStore.write(ctx, unscopedId, record);

        const normalizedCqc = row.cqcLocationId.trim().toUpperCase();
        facilityIndex.set(`${row.providerId}::${normalizedCqc}`, row.id);
        const list = facilitiesByProvider.get(row.providerId) ?? [];
        if (!list.includes(row.id)) list.push(row.id);
        facilitiesByProvider.set(row.providerId, list);

        const match = unscopedId.match(/^facility-(\d+)$/);
        if (match) this.advanceCounter(counters, row.tenantId, 'facility', parseInt(match[1], 10));
      }

      // --- Hydrate Mock Sessions ---
      const dbSessions = await (prisma as any).mockSessionV2.findMany();
      for (const row of dbSessions) {
        const ctx: TenantContext = { tenantId: row.tenantId, actorId: 'SYSTEM' };
        const unscopedId = unscopeKey(ctx, row.sessionId);
        if (!unscopedId) continue;

        const record: MockSessionRecord = {
          sessionId: row.sessionId,
          tenantId: row.tenantId,
          providerId: row.providerId,
          facilityId: row.facilityId,
          mode: row.mode as 'MOCK',
          providerSnapshot: row.providerSnapshot as MockSessionRecord['providerSnapshot'],
          topicId: row.topicId,
          status: row.status as MockSessionRecord['status'],
          followUpsUsed: row.followUpsUsed,
          maxFollowUps: row.maxFollowUps,
          createdAt: row.createdAt,
          completedAt: row.completedAt ?? undefined,
          topicCatalogVersion: row.topicCatalogVersion,
          topicCatalogHash: row.topicCatalogHash,
          prsLogicProfilesVersion: row.prsLogicProfilesVersion,
          prsLogicProfilesHash: row.prsLogicProfilesHash,
        };
        sessionsStore.write(ctx, unscopedId, record);

        const sessions = sessionsByProvider.get(row.providerId) ?? [];
        if (!sessions.includes(row.sessionId)) sessions.push(row.sessionId);
        sessionsByProvider.set(row.providerId, sessions);

        const match = unscopedId.match(/^session-(\d+)$/);
        if (match) this.advanceCounter(counters, row.tenantId, 'session', parseInt(match[1], 10));
      }

      // --- Hydrate Findings ---
      const dbFindings = await (prisma as any).findingV2.findMany();
      for (const row of dbFindings) {
        const ctx: TenantContext = { tenantId: row.tenantId, actorId: 'SYSTEM' };
        const unscopedId = unscopeKey(ctx, row.id);
        if (!unscopedId) continue;

        const record: FindingRecord = {
          id: row.id,
          tenantId: row.tenantId,
          providerId: row.providerId,
          facilityId: row.facilityId,
          sessionId: row.sessionId,
          regulationSectionId: row.regulationSectionId,
          topicId: row.topicId,
          origin: row.origin as FindingRecord['origin'],
          reportingDomain: row.reportingDomain as FindingRecord['reportingDomain'],
          severity: row.severity as FindingRecord['severity'],
          impactScore: row.impactScore,
          likelihoodScore: row.likelihoodScore,
          compositeRiskScore: row.compositeRiskScore,
          title: row.title,
          description: row.description,
          evidenceRequired: row.evidenceRequired,
          evidenceProvided: row.evidenceProvided,
          evidenceMissing: row.evidenceMissing,
          deterministicHash: row.deterministicHash,
          createdAt: row.createdAt,
        };
        findingsStore.write(ctx, unscopedId, record);

        const findings = findingsByProvider.get(row.providerId) ?? [];
        if (!findings.includes(row.id)) findings.push(row.id);
        findingsByProvider.set(row.providerId, findings);

        const match = unscopedId.match(/^finding-(\d+)$/);
        if (match) this.advanceCounter(counters, row.tenantId, 'finding', parseInt(match[1], 10));
      }

      // --- Hydrate Evidence Blobs ---
      const dbBlobs = await (prisma as any).evidenceBlobV2.findMany();
      for (const row of dbBlobs) {
        // Blobs are keyed by hash, determine tenant from any evidence record referencing it
        // For now, store under a synthetic context since blobs are content-addressed
        const record: EvidenceBlobRecord = {
          blobHash: row.blobHash,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          uploadedAt: row.uploadedAt,
        };
        // We'll re-associate blobs with tenants when hydrating evidence records
        (this as any)._pendingBlobs = (this as any)._pendingBlobs ?? new Map();
        (this as any)._pendingBlobs.set(row.blobHash, record);
      }

      // --- Hydrate Evidence Records ---
      const dbEvidenceRecords = await (prisma as any).evidenceRecordV2.findMany();
      for (const row of dbEvidenceRecords) {
        const ctx: TenantContext = { tenantId: row.tenantId, actorId: row.createdBy };
        const unscopedId = unscopeKey(ctx, row.id);
        if (!unscopedId) continue;

        // Hydrate blob for this tenant if not already done
        const pendingBlobs = (this as any)._pendingBlobs as Map<string, EvidenceBlobRecord> | undefined;
        if (pendingBlobs?.has(row.blobHash)) {
          const blob = pendingBlobs.get(row.blobHash)!;
          evidenceBlobsStore.write(ctx, blob.blobHash, blob);
        }

        const record: EvidenceRecordRecord = {
          id: row.id,
          tenantId: row.tenantId,
          providerId: row.providerId,
          facilityId: row.facilityId,
          blobHash: row.blobHash,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          evidenceType: row.evidenceType,
          fileName: row.fileName,
          description: row.description ?? undefined,
          uploadedAt: row.uploadedAt,
          createdBy: row.createdBy,
        };
        evidenceRecordsStore.write(ctx, unscopedId, record);

        const evidenceList = evidenceByFacility.get(row.facilityId) ?? [];
        if (!evidenceList.includes(row.id)) evidenceList.push(row.id);
        evidenceByFacility.set(row.facilityId, evidenceList);

        const match = unscopedId.match(/^evidence-(\d+)$/);
        if (match) this.advanceCounter(counters, row.tenantId, 'evidence', parseInt(match[1], 10));
      }
      delete (this as any)._pendingBlobs;

      // --- Hydrate Exports ---
      const dbExports = await (prisma as any).exportV2.findMany();
      for (const row of dbExports) {
        const ctx: TenantContext = { tenantId: row.tenantId, actorId: 'SYSTEM' };
        const unscopedId = unscopeKey(ctx, row.id);
        if (!unscopedId) continue;

        const record: ExportRecord = {
          id: row.id,
          tenantId: row.tenantId,
          providerId: row.providerId,
          facilityId: row.facilityId,
          sessionId: row.sessionId,
          format: row.format as ExportRecord['format'],
          content: row.content,
          reportingDomain: row.reportingDomain as ExportRecord['reportingDomain'],
          mode: row.mode as ExportRecord['mode'],
          reportSource: row.reportSource as ExportRecord['reportSource'],
          snapshotId: row.snapshotId,
          generatedAt: row.generatedAt,
          expiresAt: row.expiresAt,
        };
        exportsStore.write(ctx, unscopedId, record);

        const match = unscopedId.match(/^export-(\d+)$/);
        if (match) this.advanceCounter(counters, row.tenantId, 'export', parseInt(match[1], 10));
      }

      // --- Hydrate Audit Events ---
      const dbAuditEvents = await (prisma as any).auditEventV2.findMany({
        orderBy: { timestamp: 'asc' },
      });
      // Group by providerId, then load into the audits store (which is keyed by providerId)
      const auditsByProvider = new Map<string, { tenantId: string; events: AuditEventRecord[] }>();
      for (const row of dbAuditEvents) {
        if (!auditsByProvider.has(row.providerId)) {
          auditsByProvider.set(row.providerId, { tenantId: row.tenantId, events: [] });
        }
        const entry = auditsByProvider.get(row.providerId)!;
        const event: AuditEventRecord = {
          eventId: row.eventId,
          eventType: row.eventType,
          timestamp: row.timestamp,
          userId: row.userId,
          payloadHash: row.payloadHash,
          previousEventHash: row.previousEventHash ?? undefined,
          eventHash: row.eventHash,
          payload: row.payload as Record<string, unknown> | undefined,
        };
        entry.events.push(event);
      }
      for (const [providerId, { tenantId, events }] of auditsByProvider) {
        const ctx: TenantContext = { tenantId, actorId: 'SYSTEM' };
        auditsStore.writeByKey(ctx, providerId, events);
      }

      console.log(
        `[PrismaStore] Hydrated ${dbProviders.length} providers, ${dbFacilities.length} facilities, ` +
        `${dbSessions.length} sessions, ${dbFindings.length} findings, ${dbBlobs.length} blobs, ` +
        `${dbEvidenceRecords.length} evidence records, ${dbExports.length} exports, ` +
        `${dbAuditEvents.length} audit events`
      );
    } catch (err) {
      console.error('[PrismaStore] Hydration failed:', err);
      throw err;
    }
  }

  // --- Provider overrides ---

  override createProvider(
    ctx: TenantContext,
    input: { providerName: string; orgRef?: string }
  ): ProviderRecord {
    const record = super.createProvider(ctx, input);
    this.persistProvider(record, 'create');
    return record;
  }

  override seedDemoProvider(ctx: TenantContext): ProviderRecord | null {
    const existing = this.getProviderById(ctx, scopeKey(ctx, 'provider-1'));
    const record = super.seedDemoProvider(ctx);
    if (record && !existing) {
      this.persistProvider(record, 'create');
    }
    return record;
  }

  // --- Facility overrides ---

  override createFacility(
    ctx: TenantContext,
    input: Parameters<InMemoryStore['createFacility']>[1]
  ): FacilityRecord {
    const record = super.createFacility(ctx, input);
    this.persistFacility(record);
    this.syncProviderStats(ctx, record.providerId);
    return record;
  }

  override upsertFacility(
    ctx: TenantContext,
    input: Parameters<InMemoryStore['upsertFacility']>[1]
  ): { facility: FacilityRecord; isNew: boolean } {
    const result = super.upsertFacility(ctx, input);
    this.persistFacility(result.facility);
    this.syncProviderStats(ctx, result.facility.providerId);
    return result;
  }

  override updateFacility(
    ctx: TenantContext,
    facilityId: string,
    updates: Parameters<InMemoryStore['updateFacility']>[2]
  ): FacilityRecord {
    const record = super.updateFacility(ctx, facilityId, updates);
    this.persistFacility(record);
    this.syncProviderStats(ctx, record.providerId);
    return record;
  }

  override deleteFacility(ctx: TenantContext, facilityId: string): void {
    const facility = this.getFacilityById(ctx, facilityId);
    super.deleteFacility(ctx, facilityId);
    if (facility) {
      (prisma as any).facility
        .delete({ where: { id: facilityId } })
        .catch((err: unknown) => console.error('[PrismaStore] Failed to delete facility:', err));
      this.syncProviderStats(ctx, facility.providerId);
    }
  }

  // --- Mock Session overrides ---

  override createMockSession(
    ctx: TenantContext,
    input: Parameters<InMemoryStore['createMockSession']>[1]
  ): MockSessionRecord {
    const record = super.createMockSession(ctx, input);
    this.persistMockSession(record);
    return record;
  }

  override updateSession(ctx: TenantContext, session: MockSessionRecord): void {
    super.updateSession(ctx, session);
    this.persistMockSession(session);
  }

  // --- Finding overrides ---

  override addFinding(
    ctx: TenantContext,
    input: Parameters<InMemoryStore['addFinding']>[1]
  ): FindingRecord {
    const record = super.addFinding(ctx, input);
    this.persistFinding(record);
    return record;
  }

  // --- Evidence overrides ---

  override createEvidenceBlob(
    ctx: TenantContext,
    input: Parameters<InMemoryStore['createEvidenceBlob']>[1]
  ): EvidenceBlobRecord {
    const record = super.createEvidenceBlob(ctx, input);
    this.persistEvidenceBlob(record);
    return record;
  }

  override createEvidenceRecord(
    ctx: TenantContext,
    input: Parameters<InMemoryStore['createEvidenceRecord']>[1]
  ): EvidenceRecordRecord {
    const record = super.createEvidenceRecord(ctx, input);
    this.persistEvidenceRecord(record);
    return record;
  }

  override deleteEvidenceRecord(ctx: TenantContext, evidenceRecordId: string): EvidenceRecordRecord {
    const record = super.deleteEvidenceRecord(ctx, evidenceRecordId);
    (prisma as any).evidenceRecordV2
      .delete({ where: { id: evidenceRecordId } })
      .catch((err: unknown) => console.error('[PrismaStore] Failed to delete evidence record:', err));
    return record;
  }

  // --- Export overrides ---

  override createExport(
    ctx: TenantContext,
    input: Parameters<InMemoryStore['createExport']>[1]
  ): ExportRecord {
    const record = super.createExport(ctx, input);
    this.persistExport(record);
    return record;
  }

  // --- Audit overrides ---

  override appendAuditEvent(
    ctx: TenantContext,
    providerId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): AuditEventRecord {
    const record = super.appendAuditEvent(ctx, providerId, eventType, payload);
    this.persistAuditEvent(providerId, record, payload);
    return record;
  }

  // --- Private helpers ---

  private persistProvider(record: ProviderRecord, mode: 'create' | 'upsert' = 'upsert'): void {
    const data = {
      id: record.providerId,
      tenantId: record.tenantId,
      providerName: record.providerName,
      orgRef: record.orgRef ?? null,
      asOf: record.asOf,
      prsState: record.prsState,
      registeredBeds: record.registeredBeds,
      serviceTypes: record.serviceTypes,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
    };

    const op =
      mode === 'create'
        ? (prisma as any).provider.create({ data })
        : (prisma as any).provider.upsert({
            where: { id: record.providerId },
            create: data,
            update: {
              providerName: record.providerName,
              orgRef: record.orgRef ?? null,
              serviceTypes: record.serviceTypes,
              registeredBeds: record.registeredBeds,
              asOf: record.asOf,
            },
          });

    op.catch((err: unknown) =>
      console.error('[PrismaStore] Failed to persist provider:', err)
    );
  }

  private persistFacility(record: FacilityRecord): void {
    const data = {
      id: record.id,
      tenantId: record.tenantId,
      providerId: record.providerId,
      facilityName: record.facilityName,
      addressLine1: record.addressLine1,
      townCity: record.townCity,
      postcode: record.postcode,
      address: record.address,
      cqcLocationId: record.cqcLocationId,
      serviceType: record.serviceType,
      capacity: record.capacity ?? null,
      facilityHash: record.facilityHash,
      dataSource: record.dataSource,
      cqcSyncedAt: record.cqcSyncedAt ?? null,
      latestRating: record.latestRating ?? null,
      latestRatingDate: record.latestRatingDate ?? null,
      inspectionStatus: record.inspectionStatus,
      lastReportScrapedAt: record.lastReportScrapedAt ?? null,
      lastScrapedReportDate: record.lastScrapedReportDate ?? null,
      lastScrapedReportUrl: record.lastScrapedReportUrl ?? null,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
      asOf: record.asOf,
    };

    (prisma as any).facility
      .upsert({
        where: { id: record.id },
        create: data,
        update: {
          facilityName: record.facilityName,
          addressLine1: record.addressLine1,
          townCity: record.townCity,
          postcode: record.postcode,
          address: record.address,
          serviceType: record.serviceType,
          capacity: record.capacity ?? null,
          facilityHash: record.facilityHash,
          dataSource: record.dataSource,
          cqcSyncedAt: record.cqcSyncedAt ?? null,
          latestRating: record.latestRating ?? null,
          latestRatingDate: record.latestRatingDate ?? null,
          inspectionStatus: record.inspectionStatus,
          lastReportScrapedAt: record.lastReportScrapedAt ?? null,
          lastScrapedReportDate: record.lastScrapedReportDate ?? null,
          lastScrapedReportUrl: record.lastScrapedReportUrl ?? null,
          asOf: record.asOf,
        },
      })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to persist facility:', err)
      );
  }

  private persistMockSession(record: MockSessionRecord): void {
    const data = {
      sessionId: record.sessionId,
      tenantId: record.tenantId,
      providerId: record.providerId,
      facilityId: record.facilityId,
      mode: record.mode,
      providerSnapshot: record.providerSnapshot as any,
      topicId: record.topicId,
      status: record.status,
      followUpsUsed: record.followUpsUsed,
      maxFollowUps: record.maxFollowUps,
      createdAt: record.createdAt,
      completedAt: record.completedAt ?? null,
      topicCatalogVersion: record.topicCatalogVersion,
      topicCatalogHash: record.topicCatalogHash,
      prsLogicProfilesVersion: record.prsLogicProfilesVersion,
      prsLogicProfilesHash: record.prsLogicProfilesHash,
    };

    (prisma as any).mockSessionV2
      .upsert({
        where: { sessionId: record.sessionId },
        create: data,
        update: {
          status: record.status,
          followUpsUsed: record.followUpsUsed,
          completedAt: record.completedAt ?? null,
        },
      })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to persist mock session:', err)
      );
  }

  private persistFinding(record: FindingRecord): void {
    const data = {
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
      createdAt: record.createdAt,
    };

    (prisma as any).findingV2
      .create({ data })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to persist finding:', err)
      );
  }

  private persistEvidenceBlob(record: EvidenceBlobRecord): void {
    const data = {
      blobHash: record.blobHash,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      uploadedAt: record.uploadedAt,
    };

    (prisma as any).evidenceBlobV2
      .upsert({
        where: { blobHash: record.blobHash },
        create: data,
        update: {},
      })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to persist evidence blob:', err)
      );
  }

  private persistEvidenceRecord(record: EvidenceRecordRecord): void {
    const data = {
      id: record.id,
      tenantId: record.tenantId,
      providerId: record.providerId,
      facilityId: record.facilityId,
      blobHash: record.blobHash,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      evidenceType: record.evidenceType,
      fileName: record.fileName,
      description: record.description ?? null,
      uploadedAt: record.uploadedAt,
      createdBy: record.createdBy,
    };

    (prisma as any).evidenceRecordV2
      .create({ data })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to persist evidence record:', err)
      );
  }

  private persistExport(record: ExportRecord): void {
    const data = {
      id: record.id,
      tenantId: record.tenantId,
      providerId: record.providerId,
      facilityId: record.facilityId,
      sessionId: record.sessionId,
      format: record.format,
      content: record.content,
      reportingDomain: record.reportingDomain,
      mode: record.mode,
      reportSource: record.reportSource as any,
      snapshotId: record.snapshotId,
      generatedAt: record.generatedAt,
      expiresAt: record.expiresAt,
    };

    (prisma as any).exportV2
      .create({ data })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to persist export:', err)
      );
  }

  private persistAuditEvent(providerId: string, record: AuditEventRecord, payload: Record<string, unknown>): void {
    // Extract tenantId from the providerId (scoped key format: "tenantId:provider-N")
    const colonIndex = providerId.indexOf(':');
    const tenantId = colonIndex > 0 ? providerId.slice(0, colonIndex) : 'unknown';

    const data = {
      eventId: record.eventId,
      tenantId,
      providerId,
      eventType: record.eventType,
      timestamp: record.timestamp,
      userId: record.userId,
      payloadHash: record.payloadHash,
      previousEventHash: record.previousEventHash ?? null,
      eventHash: record.eventHash,
      payload: payload as any,
    };

    (prisma as any).auditEventV2
      .create({ data })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to persist audit event:', err)
      );
  }

  /**
   * After a facility write, sync provider stats to Postgres.
   */
  private syncProviderStats(ctx: TenantContext, providerId: string): void {
    const provider = this.getProviderById(ctx, providerId);
    if (!provider) return;

    (prisma as any).provider
      .update({
        where: { id: provider.providerId },
        data: {
          serviceTypes: provider.serviceTypes,
          registeredBeds: provider.registeredBeds,
          asOf: provider.asOf,
        },
      })
      .catch((err: unknown) =>
        console.error('[PrismaStore] Failed to sync provider stats:', err)
      );
  }
}
