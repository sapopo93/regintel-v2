'use client';
export const dynamic = "force-dynamic";


/**
 * Audit Trail Page
 *
 * Displays immutable hash-chained audit log for a provider.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { AuditTrailResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function AuditPage() {
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<AuditTrailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId || !facilityId) {
      setError('Provider and facility are required');
      setLoading(false);
      return;
    }

    Promise.all([
      apiClient.getProviderOverview(providerId, facilityId),
      apiClient.getAuditTrail(providerId, facilityId),
    ])
      .then(([overviewResponse, auditResponse]) => {
        validateConstitutionalRequirements(auditResponse, { strict: true });
        setOverview(overviewResponse);
        setData(auditResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, facilityId]);

  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error || !data || !overview) {
    return (
      <div className={styles.layout}>
        <div className={styles.error}>Error: {error || 'Failed to load data'}</div>
      </div>
    );
  }

  const toActivityLabel = (eventType: string) => {
    const map: Record<string, string> = {
      MOCK_SESSION_STARTED: 'Practice inspection started',
      MOCK_SESSION_ANSWERED: 'Practice inspection answer saved',
      MOCK_SESSION_COMPLETED: 'Practice inspection completed',
      FINDING_CREATED: 'Finding created',
      EVIDENCE_UPLOADED: 'Evidence uploaded',
      EXPORT_GENERATED: 'Export generated',
    };
    return map[eventType] ?? eventType.replaceAll('_', ' ').toLowerCase();
  };

  return (
    <SimulationFrame reportingDomain={data.reportingDomain}>
      <div className={styles.layout}>
        <Sidebar
          providerName={overview.provider.providerName}
          snapshotDate={overview.provider.asOf}
          status={overview.provider.prsState}
          topicCatalogVersion={data.topicCatalogVersion}
          prsLogicVersion={data.prsLogicVersion}
          topicsCompleted={overview.topicsCompleted}
          totalTopics={overview.totalTopics}
        />

        <main className={styles.main}>
          <PageHeader
            title="Audit Trail"
            subtitle={`${data.totalCount} audit events`}
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

          <DisclosurePanel
            summary={(
              <div className={styles.integrity}>
                <h2 className={styles.integrityTitle}>Activity Integrity</h2>
                <p className={styles.integrityDescription}>
                  This timeline records key provider actions in order so teams can review what happened and when.
                </p>
              </div>
            )}
            evidence={(
              <div className={styles.auditList}>
                {data.events.length === 0 ? (
                  <div className={styles.empty}>No audit events found</div>
                ) : (
                  data.events.map((event, index) => (
                    <div key={event.eventId} className={styles.auditCard}>
                      <div className={styles.auditHeader}>
                        <span className={styles.eventNumber}>#{index + 1}</span>
                        <span className={styles.eventType}>{toActivityLabel(event.eventType)}</span>
                        <span className={styles.timestamp}>
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>

                      <dl className={styles.auditMeta}>
                        <dt>Recorded By</dt>
                        <dd>{event.userId}</dd>
                      </dl>

                      {event.previousEventHash && <div className={styles.chainIndicator}>Linked to previous activity</div>}
                    </div>
                  ))
                )}
              </div>
            )}
            trace={(
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
            )}
          />
        </main>
      </div>
    </SimulationFrame>
  );
}
