'use client';

/**
 * Topics List Page
 *
 * Displays all inspection topics from the frozen catalog.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { ProviderOverviewResponse, TopicsListResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function TopicsPage() {
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<TopicsListResponse | null>(null);
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
      apiClient.getTopics(providerId, facilityId),
    ])
      .then(([overviewResponse, topicsResponse]) => {
        validateConstitutionalRequirements(topicsResponse, { strict: true });
        setOverview(overviewResponse);
        setData(topicsResponse);
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
            title="Inspection Topics"
            subtitle="All topics from frozen catalog"
            topicCatalogVersion={data.topicCatalogVersion}
            topicCatalogHash={data.topicCatalogHash}
            prsLogicVersion={data.prsLogicVersion}
            prsLogicHash={data.prsLogicHash}
            snapshotTimestamp={data.snapshotTimestamp}
            domain={data.domain}
            reportingDomain={data.reportingDomain}
          />

          <DisclosurePanel
            summary={(
              <div className={styles.topicsList}>
                {data.topics.map((topic) => (
                  <Link
                    key={topic.id}
                    href={`/topics/${topic.id}?provider=${providerId}&facility=${facilityId}`}
                    className={styles.topicCard}
                  >
                    <div className={styles.topicHeader}>
                      <h3 className={styles.topicTitle}>{topic.title}</h3>
                      <div className={styles.topicBadge}>{topic.questionMode}</div>
                    </div>
                    <div className={styles.topicMeta}>
                      <span>Regulation: {topic.regulationSectionId}</span>
                      <span>Max follow-ups: {topic.maxFollowUps}</span>
                    </div>
                    <div className={styles.topicEvidence}>
                      Evidence required: {topic.evidenceRequirements.length} items
                    </div>
                  </Link>
                ))}
              </div>
            )}
            evidence={(
              <div className={styles.completionPanel}>
                <h2 className={styles.sectionTitle}>Completion Status</h2>
                <ul className={styles.completionList}>
                  {data.topics.map((topic) => {
                    const status = data.completionStatus[topic.id];
                    return (
                      <li key={topic.id} className={styles.completionItem}>
                        <span>{topic.title}</span>
                        <span>
                          {status?.completed ?? 0} / {status?.total ?? 0}
                        </span>
                      </li>
                    );
                  })}
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
              />
            )}
          />
        </main>
      </div>
    </SimulationFrame>
  );
}
