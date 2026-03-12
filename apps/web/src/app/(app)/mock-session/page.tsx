'use client';
export const dynamic = "force-dynamic";


/**
 * Mock Sessions List Page
 *
 * Displays all mock inspection sessions for a provider.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { EmptyState } from '@/components/layout/EmptyState';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { PlayCircle } from 'lucide-react';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { MockSessionsListResponse, ProviderOverviewResponse, Topic } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { formatTopicId } from '@/lib/format';
import styles from './page.module.css';

export default function MockSessionsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { providerId: rawProviderId, facilityId: rawFacilityId, ready } = useRequireProviderAndFacility();
  // Decode URL-encoded params (colons in tenant:resource IDs get encoded as %3A)
  const providerId = rawProviderId ? decodeURIComponent(rawProviderId) : null;
  const facilityId = rawFacilityId ? decodeURIComponent(rawFacilityId) : null;

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<MockSessionsListResponse | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [creating, setCreating] = useState(false);
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
      apiClient.getMockSessions(providerId, facilityId),
      apiClient.getTopics(providerId, facilityId),
    ])
      .then(([overviewResponse, sessionsResponse, topicsResponse]) => {
        validateConstitutionalRequirements(sessionsResponse, { strict: true });
        setOverview(overviewResponse);
        setData(sessionsResponse);
        setTopics(topicsResponse.topics);
        setSelectedTopic(topicsResponse.topics[0]?.id || '');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, facilityId, ready]);

  const handleCreateSession = async () => {
    if (!providerId || !facilityId || !selectedTopic) {
      setError('Provider, facility, and topic are required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const created = await apiClient.createMockSession(providerId, selectedTopic, facilityId);
      router.push(`/mock-session/${created.sessionId}?provider=${providerId}&facility=${facilityId}`);
      return;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setCreating(false);
    }
  };

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
            title="Mock Inspections"
            subtitle="All mock inspection sessions"
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

          <div className={styles.introBanner}>
            <h2 className={styles.introTitle}>What is a Mock Inspection?</h2>
            <p className={styles.introText}>
              A mock inspection simulates a CQC visit. A virtual inspector will ask you 4–5 questions about a specific area of your service. Your answers will reveal compliance gaps and missing evidence — before a real inspector arrives. Sessions are private and do not affect your official CQC record.
            </p>
          </div>

          <div className={styles.snapshotPanel}>
            <h2 className={styles.sectionTitle}>Start a Mock Inspection</h2>
            <div className={styles.formRow}>
              <label className={styles.label}>
                Inspection Area
                <select
                  value={selectedTopic}
                  onChange={(event) => setSelectedTopic(event.target.value)}
                  className={styles.select}
                  data-testid="mock-session-topic-select"
                >
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={styles.startButton}
                onClick={handleCreateSession}
                disabled={creating || !selectedTopic}
                data-testid="primary-start-session"
              >
                {creating ? 'Starting...' : 'Start Mock Inspection'}
              </button>
            </div>
          </div>

          <DisclosurePanel
            summary={(
              <div className={styles.sessionsList}>
                {data.sessions.length === 0 ? (
                  <EmptyState
                    icon={PlayCircle}
                    title="No mock sessions found"
                    description="Start a mock inspection using the form above to prepare for your CQC visit."
                  />
                ) : (
                  data.sessions.map((session) => (
                    <Link
                      key={session.sessionId}
                      href={`/mock-session/${session.sessionId}?provider=${providerId}&facility=${facilityId}`}
                      className={styles.sessionCard}
                    >
                      <div className={styles.sessionCardInner}>
                        <div className={styles.sessionHeader}>
                          <div>
                            <h3 className={styles.sessionTitle}>
                              {topics.find((t) => t.id === session.topicId)?.title ?? formatTopicId(session.topicId)}
                            </h3>
                            <div className={styles.sessionMeta}>
                              <span>{session.status === 'IN_PROGRESS' ? `Question ${session.followUpsUsed + 1} of ${session.maxFollowUps + 1}` : `${session.maxFollowUps + 1} questions completed`}</span>
                              <span>Started: {new Date(session.createdAt).toLocaleDateString('en-GB')}</span>
                            </div>
                          </div>
                          <div className={`${styles.statusBadge} ${styles[session.status.toLowerCase()]}`}>
                            {session.status === 'IN_PROGRESS' ? 'In Progress' : session.status === 'COMPLETED' ? 'Complete' : 'Abandoned'}
                          </div>
                        </div>
                        <div className={styles.sessionAction}>
                          {session.status === 'IN_PROGRESS' ? (
                            <span className={styles.resumeHint}>Resume →</span>
                          ) : session.status === 'COMPLETED' ? (
                            <span className={styles.viewHint}>View results →</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
            evidence={null}
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
