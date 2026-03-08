'use client';
export const dynamic = "force-dynamic";


/**
 * Evidence Page
 *
 * Displays all evidence records for a provider.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { EvidenceListResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function EvidencePage() {
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<EvidenceListResponse | null>(null);
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
      apiClient.getEvidence(providerId, facilityId),
    ])
      .then(([overviewResponse, evidenceResponse]) => {
        validateConstitutionalRequirements(evidenceResponse, { strict: true });
        setOverview(overviewResponse);
        setData(evidenceResponse);
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

  const formatBytes = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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
            title="Evidence Records"
            subtitle={`${data.totalCount} evidence items`}
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
              <div className={styles.summaryPanel}>
                <h2 className={styles.sectionTitle}>Evidence Summary</h2>
                <p className={styles.summaryText}>
                  {data.totalCount} evidence items are currently registered for this provider.
                </p>
              </div>
            )}
            evidence={(
              <div className={styles.evidenceList}>
                {data.evidence.length === 0 ? (
                  <div className={styles.empty}>No evidence records found</div>
                ) : (
                  data.evidence.map((record) => {
                    const audit = record.documentAudit;
                    const expiryInfo = record.expiresAt ? (() => {
                      const daysUntil = Math.ceil((new Date(record.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      return { daysUntil, isOverdue: daysUntil < 0 };
                    })() : null;

                    return (
                      <div key={record.evidenceRecordId} className={styles.evidenceCard}>
                        <div className={styles.evidenceHeader}>
                          <h3 className={styles.evidenceTitle}>{record.fileName}</h3>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {audit?.status === 'COMPLETED' && audit.overallResult && (
                              <span className={`${styles.statusBadge} ${
                                audit.overallResult === 'PASS' ? styles.auditPass :
                                audit.overallResult === 'NEEDS_IMPROVEMENT' ? styles.auditAmber :
                                styles.auditRed
                              }`}>
                                {audit.complianceScore != null ? `${audit.complianceScore}%` : audit.overallResult}
                              </span>
                            )}
                            {audit?.status === 'PENDING' && (
                              <span className={`${styles.statusBadge} ${styles.auditPending}`}>Auditing...</span>
                            )}
                            {expiryInfo && (
                              <span className={`${styles.statusBadge} ${
                                expiryInfo.isOverdue ? styles.auditRed :
                                expiryInfo.daysUntil <= 14 ? styles.auditAmber : ''
                              }`}>
                                {expiryInfo.isOverdue
                                  ? `OVERDUE (${Math.abs(expiryInfo.daysUntil)}d)`
                                  : `Expires ${expiryInfo.daysUntil}d`}
                              </span>
                            )}
                            <div className={styles.statusBadge}>{record.evidenceType}</div>
                          </div>
                        </div>

                        <dl className={styles.evidenceMeta}>
                          <dt>File Type</dt>
                          <dd>{record.mimeType}</dd>

                          <dt>Uploaded At</dt>
                          <dd>{new Date(record.uploadedAt).toLocaleString()}</dd>

                          <dt>File Size</dt>
                          <dd>{formatBytes(record.sizeBytes)}</dd>
                        </dl>

                        {audit?.status === 'COMPLETED' && audit.summary && (
                          <div className={styles.auditSummarySection}>
                            <p className={styles.auditSummaryText}>{audit.summary}</p>
                            <div className={styles.auditFindingCounts}>
                              {(audit.criticalFindings ?? 0) > 0 && (
                                <span className={styles.auditCountCritical}>{audit.criticalFindings} critical</span>
                              )}
                              {(audit.highFindings ?? 0) > 0 && (
                                <span className={styles.auditCountHigh}>{audit.highFindings} high</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
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
