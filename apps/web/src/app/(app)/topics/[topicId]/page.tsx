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
import { MetadataBar } from '@/components/constitutional/MetadataBar';
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
                  <dt>Topic ID</dt>
                  <dd>{data.id}</dd>

                  <dt>Regulation Section</dt>
                  <dd>{data.regulationSectionId}</dd>

                  <dt>Question Mode</dt>
                  <dd>{data.questionMode}</dd>

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
