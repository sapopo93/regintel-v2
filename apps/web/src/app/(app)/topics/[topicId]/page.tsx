'use client';
export const dynamic = "force-dynamic";


/**
 * Topic Detail Page
 *
 * Displays a single topic with all metadata.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { Topic, ConstitutionalMetadata, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function TopicDetailPage() {
  const params = useParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();
  const topicId = params.topicId as string;

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<(Topic & ConstitutionalMetadata) | null>(null);
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
      apiClient.getTopic(providerId, topicId, facilityId),
    ])
      .then(([overviewResponse, topicResponse]) => {
        validateConstitutionalRequirements(topicResponse, { strict: true });
        setOverview(overviewResponse);
        setData(topicResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, facilityId, topicId, ready]);

  if (!ready) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="detail" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="detail" />
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
            subtitle="Topic detail"
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
                <h2 className={styles.sectionTitle}>Topic Information</h2>
                <dl className={styles.definitionList}>
                  <dt>Regulation Section</dt>
                  <dd>{data.regulationSectionId}</dd>

                  <dt>Review Approach</dt>
                  <dd>{data.questionMode.replaceAll('_', ' ')}</dd>

                  <dt>Max Follow-ups</dt>
                  <dd>{data.maxFollowUps}</dd>
                </dl>
              </div>
            )}
            evidence={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Evidence Requirements</h2>
                <ul className={styles.evidenceList}>
                  {data.evidenceRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
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

          <div className={styles.actions}>
            <Link
              href={`/topics?provider=${providerId}&facility=${facilityId}`}
              className={styles.backButton}
            >
              ← Back to Topics
            </Link>
          </div>
        </main>
      </div>
    </SimulationFrame>
  );
}
