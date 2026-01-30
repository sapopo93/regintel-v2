'use client';
export const dynamic = "force-dynamic";


/**
 * Facilities List Page
 *
 * Constitutional requirements satisfied:
 * - Version: Topic Catalog v1, PRS Logic v1
 * - Hash: Both catalog and logic hashes displayed
 * - Time: Snapshot timestamp
 * - Domain: CQC
 *
 * Facts only - no interpretation:
 * - Facility list with details
 * - Add new facility action
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { apiClient } from '@/lib/api/client';
import type { FacilitiesListResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function FacilitiesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get('provider');

  const [data, setData] = useState<FacilitiesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId) {
      setError('Provider ID is required');
      setLoading(false);
      return;
    }
    apiClient.getFacilities(providerId || undefined)
      .then((response) => {
        validateConstitutionalRequirements(response, { strict: true });
        setData(response);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId]);

  const handleAddFacility = () => {
    router.push(`/facilities/new?provider=${providerId}`);
  };

  const handleViewFacility = (facilityId: string) => {
    router.push(`/overview?provider=${providerId}&facility=${facilityId}` as any);
  };

  // Always render Sidebar for navigation, even during loading/error states
  const sidebarProps = data
    ? {
        providerName: data.provider?.providerName || 'Provider',
        snapshotDate: data.provider?.asOf || data.snapshotTimestamp,
        topicCatalogVersion: data.topicCatalogVersion,
        prsLogicVersion: data.prsLogicVersion,
      }
    : {
        providerName: 'Loading...',
        snapshotDate: new Date().toISOString(),
        topicCatalogVersion: 'v1',
        prsLogicVersion: 'v1',
      };

  return (
    <div className={styles.layout}>
      <Sidebar {...sidebarProps} />

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>Loading facilities...</div>
        ) : error || !data ? (
          <div className={styles.error}>Error: {error || 'Failed to load facilities'}</div>
        ) : (
          <>
            <PageHeader
              title="Facilities"
              subtitle={`${data.totalCount} facilities registered`}
              topicCatalogVersion={data.topicCatalogVersion}
              topicCatalogHash={data.topicCatalogHash}
              prsLogicVersion={data.prsLogicVersion}
              prsLogicHash={data.prsLogicHash}
              snapshotTimestamp={data.snapshotTimestamp}
              domain={data.domain}
              reportingDomain={data.reportingDomain}
              mode={data.mode}
              reportSource={data.reportSource}
              snapshotId={data.snapshotId}
              ingestionStatus={data.ingestionStatus}
            />

            <MetadataBar
              topicCatalogVersion={data.topicCatalogVersion}
              topicCatalogHash={data.topicCatalogHash}
              prsLogicVersion={data.prsLogicVersion}
              prsLogicHash={data.prsLogicHash}
              snapshotTimestamp={data.snapshotTimestamp}
              domain={data.domain}
              reportingDomain={data.reportingDomain}
              mode={data.mode}
              reportSource={data.reportSource}
              snapshotId={data.snapshotId}
              ingestionStatus={data.ingestionStatus}
            />

            <div className={styles.actions}>
              <button
                className={styles.addButton}
                onClick={handleAddFacility}
                data-testid="add-facility-button"
              >
                Add Facility
              </button>
            </div>

            {data.facilities.length === 0 ? (
              <div className={styles.empty}>
                <p>No facilities registered yet.</p>
                <p>Click "Add Facility" to register your first facility.</p>
              </div>
            ) : (
              <div className={styles.facilitiesList}>
                {data.facilities.map((facility) => (
                  <div
                    key={facility.id}
                    className={styles.facilityCard}
                    onClick={() => handleViewFacility(facility.id)}
                    data-testid={`facility-card-${facility.id}`}
                  >
                    <h3 className={styles.facilityName}>{facility.facilityName}</h3>
                    <div className={styles.facilityDetails}>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>CQC Location ID:</span>
                        <span className={styles.detailValue}>{facility.cqcLocationId}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Service Type:</span>
                        <span className={styles.detailValue}>{facility.serviceType}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Address:</span>
                        <span className={styles.detailValue}>
                          {facility.addressLine1}, {facility.townCity}, {facility.postcode}
                        </span>
                      </div>
                      {facility.capacity && (
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>Capacity:</span>
                          <span className={styles.detailValue}>{facility.capacity}</span>
                        </div>
                      )}
                    </div>
                    <div className={styles.facilityHash}>
                      Hash: {facility.facilityHash.substring(0, 16)}...
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
