'use client';
export const dynamic = "force-dynamic";


/**
 * Topic Detail Page
 *
 * Displays a single topic with all metadata.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { Topic, ConstitutionalMetadata, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function TopicDetailPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');
  const topicId = params.topicId as string;
  const questionModeDisplayMap: Record<string, string> = {
    STRUCTURED: 'Structured Review',
    OPEN: 'Open Questions',
    HYBRID: 'Mixed Format',
  };

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<(Topic & ConstitutionalMetadata) | null>(null);
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
      apiClient.getTopic(providerId, topicId, facilityId),
    ])
      .then(([overviewResponse, topicResponse]) => {
        validateConstitutionalRequirements(topicResponse, { strict: true });
        setOverview(overviewResponse);
        setData(topicResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, facilityId, topicId]);

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
            title={data.title}
            subtitle="Compliance area details"
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
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>About This Compliance Area</h2>
                <dl className={styles.definitionList}>
                  <dt>Reference</dt>
                  <dd>{data.id}</dd>

                  <dt>CQC Regulation</dt>
                  <dd>{data.regulationSectionId}</dd>

                  <dt>Assessment Type</dt>
                  <dd>{questionModeDisplayMap[data.questionMode] ?? data.questionMode}</dd>

                  <dt>Maximum follow-up questions</dt>
                  <dd>{data.maxFollowUps}</dd>
                </dl>
              </div>
            )}
            evidence={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Documents Required for This Area</h2>
                <ul className={styles.evidenceList}>
                  {data.evidenceRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
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

          <div className={styles.actions}>
            <Link
              href={`/topics?provider=${providerId}&facility=${facilityId}`}
              className={styles.backButton}
            >
              ← Back to Compliance Areas
            </Link>
          </div>
        </main>
      </div>
    </SimulationFrame>
  );
}
