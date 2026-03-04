'use client';
export const dynamic = "force-dynamic";


/**
 * Evidence Page
 *
 * Displays all evidence records for a provider.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
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
  const router = useRouter();

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
            title="Uploaded Documents"
            subtitle={`${data.totalCount} documents uploaded`}
            actions={(
              <button
                onClick={() => router.push(`/facilities/${facilityId}?provider=${providerId}`)}
                style={{ padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
              >
                Upload a Document
              </button>
            )}
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
                <h2 className={styles.sectionTitle}>Documents Overview</h2>
                <p className={styles.summaryText}>
                  {data.totalCount === 0 ? 'No documents have been uploaded yet. Upload your policies, training records and CQC reports to improve your compliance score.' : `${data.totalCount} document${data.totalCount === 1 ? '' : 's'} uploaded for this location.`}
                </p>
              </div>
            )}
            evidence={(
              <div className={styles.evidenceList}>
                {data.evidence.length === 0 ? (
                  <div className={styles.empty}>No documents have been uploaded yet</div>
                ) : (
                  data.evidence.map((record) => (
                    <div key={record.evidenceRecordId} className={styles.evidenceCard}>
                      <div className={styles.evidenceHeader}>
                        <h3 className={styles.evidenceTitle}>{record.fileName}</h3>
                        <div className={styles.statusBadge}>{record.evidenceType}</div>
                      </div>

                      <dl className={styles.evidenceMeta}>
                        <dt>File Type</dt>
                        <dd>{record.mimeType}</dd>

                        <dt>Date Uploaded</dt>
                        <dd>{new Date(record.uploadedAt).toLocaleString()}</dd>

                        <dt>File Size</dt>
                        <dd>{(record.sizeBytes / 1024).toFixed(1)} KB</dd>
                      </dl>
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
