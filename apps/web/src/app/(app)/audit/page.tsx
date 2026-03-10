'use client';
export const dynamic = "force-dynamic";


/**
 * Audit Trail Page
 *
 * Displays immutable hash-chained audit log for a provider.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { AuditTrailResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { EmptyState } from '@/components/layout/EmptyState';
import { ScrollText } from 'lucide-react';
import styles from './page.module.css';

export default function AuditPage() {
  const searchParams = useSearchParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<AuditTrailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    if (!ready || !providerId || !facilityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
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
  };

  useEffect(loadData, [providerId, facilityId, ready]);

  if (loading) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  if (error || !data || !overview) {
    return (
      <div className={styles.layout}>
        <ErrorState message={error || 'Failed to load data'} onRetry={loadData} />
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
      EVIDENCE_RECORDED: 'Evidence uploaded',
      EVIDENCE_DELETED: 'Evidence removed',
      EXPORT_GENERATED: 'Export generated',
      PROVIDER_CREATED: 'Provider created',
      FACILITY_CREATED: 'Location registered',
      FACILITY_ONBOARDED: 'Location onboarded',
      FACILITY_UPDATED: 'Location updated',
      FACILITY_DELETED: 'Location deleted',
      REPORT_SCRAPED: 'CQC report synced',
    };
    return map[eventType] ?? eventType.replaceAll('_', ' ').toLowerCase();
  };

  const formatPayloadDetail = (key: string, value: unknown): string => {
    if (key === 'sizeBytes' && typeof value === 'number') {
      return value > 1024 * 1024
        ? `${(value / (1024 * 1024)).toFixed(1)} MB`
        : `${(value / 1024).toFixed(1)} KB`;
    }
    return String(value);
  };

  const DISPLAY_PAYLOAD_KEYS = new Set([
    'facilityName', 'cqcLocationId', 'fileName', 'mimeType', 'sizeBytes',
    'evidenceType', 'format', 'topicId', 'findingsCount', 'providerName',
    'dataSource', 'reportDate', 'rating',
  ]);

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
            labels={{ summary: 'Activity Log', evidence: 'Hash Verification', trace: 'Metadata' }}
            summary={(
              <div>
                <div className={styles.integrity}>
                  <h2 className={styles.integrityTitle}>Activity Integrity</h2>
                  <p className={styles.integrityDescription}>
                    This timeline records key provider actions in order so teams can review what happened and when.
                  </p>
                </div>

                <div className={styles.auditList}>
                  {data.events.length === 0 ? (
                    <EmptyState
                      icon={ScrollText}
                      title="No audit events found"
                      description="Activity will appear here as you use the platform."
                    />
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

                        {event.payload && (
                          <div className={styles.payloadDetails}>
                            {Object.entries(event.payload)
                              .filter(([key]) => DISPLAY_PAYLOAD_KEYS.has(key))
                              .map(([key, value]) => (
                                <span key={key} className={styles.payloadTag}>
                                  {key.replace(/([A-Z])/g, ' $1').trim()}: {formatPayloadDetail(key, value)}
                                </span>
                              ))}
                          </div>
                        )}

                        {event.previousEventHash && <div className={styles.chainIndicator}>Linked to previous activity</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            evidence={(
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
