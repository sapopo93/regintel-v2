/**
 * PrismaStore — PostgreSQL-backed store for Provider and Facility persistence.
 *
 * Strategy: write-through cache.
 * - On startup: hydrate InMemoryStore from Postgres (call waitForReady() before serving traffic).
 * - On writes: update InMemoryStore synchronously (so callers get immediate results),
 *   then persist to Postgres asynchronously (fire-and-forget with error logging).
 * - All other data (sessions, findings, exports, evidence, audit) stays in InMemoryStore
 *   for now — they are session-scoped and acceptable for MVP.
 */

import { PrismaClient } from '@prisma/client';
import {
  InMemoryStore,
  type TenantContext,
  type ProviderRecord,
  type FacilityRecord,
} from './store';
import { scopeKey, unscopeKey } from '@regintel/security/tenant';

const prisma = new PrismaClient();

export class PrismaStore extends InMemoryStore {
  private hydratePromise: Promise<void>;

  constructor() {
    super();
    console.log('[PrismaStore] Using PostgreSQL for Provider/Facility persistence');
    this.hydratePromise = this.hydrate();
  }

  /**
   * Blocks until DB hydration is complete.
   * Call this before the HTTP server starts accepting traffic.
   */
  async waitForReady(): Promise<void> {
    await this.hydratePromise;
  }

  private async hydrate(): Promise<void> {
    try {
      // Access parent's private stores via runtime cast (TypeScript private is compile-time only)
      const providersStore = (this as any).providers;
      const facilitiesStore = (this as any).facilities;
      const counters = (this as any).counters as Map<string, Record<string, number>>;
      const facilityIndex = (this as any).facilityIndex as Map<string, string>;
      const facilitiesByProvider = (this as any).facilitiesByProvider as Map<string, string[]>;

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

        // Advance counter so new providers don't collide with existing IDs
        const match = unscopedId.match(/^provider-(\d+)$/);
        if (match) {
          const seq = parseInt(match[1], 10);
          const tc = counters.get(row.tenantId) ?? {};
          tc['provider'] = Math.max(tc['provider'] ?? 0, seq);
          counters.set(row.tenantId, tc);
        }
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

        // Rebuild indexes
        const normalizedCqc = row.cqcLocationId.trim().toUpperCase();
        facilityIndex.set(`${row.providerId}::${normalizedCqc}`, row.id);
        const list = facilitiesByProvider.get(row.providerId) ?? [];
        if (!list.includes(row.id)) list.push(row.id);
        facilitiesByProvider.set(row.providerId, list);

        // Advance facility counter
        const match = unscopedId.match(/^facility-(\d+)$/);
        if (match) {
          const seq = parseInt(match[1], 10);
          const tc = counters.get(row.tenantId) ?? {};
          tc['facility'] = Math.max(tc['facility'] ?? 0, seq);
          counters.set(row.tenantId, tc);
        }
      }

      console.log(
        `[PrismaStore] Hydrated ${dbProviders.length} providers, ${dbFacilities.length} facilities`
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

  /**
   * After a facility write, the parent's createFacility/upsertFacility updates the
   * provider's serviceTypes and registeredBeds in memory. Sync those stats to Postgres.
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
