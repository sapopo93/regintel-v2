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

  const formatEventType = (type: string) => {
    const map: Record<string, string> = {
      'MOCK_SESSION_STARTED': 'Practice Inspection Started',
      'MOCK_SESSION_COMPLETED': 'Practice Inspection Completed',
      'EVIDENCE_UPLOADED': 'Document Uploaded',
      'FINDING_CREATED': 'Action Item Created',
      'EXPORT_GENERATED': 'Report Downloaded',
    };
    return map[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
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
            title="Activity Log"
            subtitle={`${data.totalCount} recorded activities`}
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
                <h2 className={styles.integrityTitle}>Tamper-Proof Record</h2>
                <p className={styles.integrityDescription}>
                  Every action in this system is permanently recorded and cannot be altered. Each entry is linked to the one before it, so any attempt to change historical records would be immediately detected.
                </p>
              </div>
            )}
            evidence={(
              <div className={styles.auditList}>
                {data.events.length === 0 ? (
                  <div className={styles.empty}>No activity recorded yet</div>
                ) : (
                  data.events.map((event, index) => (
                    <div key={event.eventId} className={styles.auditCard}>
                      <div className={styles.auditHeader}>
                        <span className={styles.eventNumber}>#{index + 1}</span>
                        <span className={styles.eventType}>{formatEventType(event.eventType)}</span>
                        <span className={styles.timestamp}>
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>

                      <dl className={styles.auditMeta}>
                        <dt>Activity Reference</dt>
                        <dd>{'Entry #' + (index + 1)}</dd>

                        <dt>Performed By</dt>
                        <dd>{'User ...' + event.userId.slice(-8)}</dd>
                      </dl>

                      {event.previousEventHash && (
                        <div className={styles.chainIndicator}>
                          ✓ Linked to previous entry
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
            trace={(
              <div style={{ padding: '16px', color: '#666', fontSize: '14px' }}>
                <p><strong>Compliance Framework:</strong> {data.topicCatalogVersion}</p>
                <p><strong>Rules Engine:</strong> {data.prsLogicVersion}</p>
                <p><strong>Data as of:</strong> {new Date(data.snapshotTimestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p><strong>Inspection Type:</strong> {data.mode === 'REAL' ? 'Live CQC Data' : 'Practice Inspection'}</p>
              </div>
            )}
          />
        </main>
      </div>
    </SimulationFrame>
  );
}
