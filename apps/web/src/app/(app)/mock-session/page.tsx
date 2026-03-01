'use client';
export const dynamic = "force-dynamic";


/**
 * Mock Sessions List Page
 *
 * Displays all mock inspection sessions for a provider.
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
import type { MockSessionsListResponse, ProviderOverviewResponse, Topic } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function MockSessionsPage() {
  const searchParams = useSearchParams();
  // Decode URL-encoded params (colons in tenant:resource IDs get encoded as %3A)
  const providerId = searchParams.get('provider') ? decodeURIComponent(searchParams.get('provider')!) : null;
  const facilityId = searchParams.get('facility') ? decodeURIComponent(searchParams.get('facility')!) : null;

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<MockSessionsListResponse | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
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
  }, [providerId, facilityId]);

  const handleCreateSession = async () => {
    if (!providerId || !facilityId || !selectedTopic) {
      setError('Provider, facility, and topic are required');
      return;
    }

    setCreating(true);
    setError(null);
    setCreateStatus('Creating mock session...');
    setCreatedSessionId(null);

    try {
      const created = await apiClient.createMockSession(providerId, selectedTopic, facilityId);
      const refreshed = await apiClient.getMockSessions(providerId, facilityId);
      setData(refreshed);
      setCreateStatus(`Session created: ${created.sessionId}`);
      setCreatedSessionId(created.sessionId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
      setCreateStatus(null);
    } finally {
      setCreating(false);
    }
  };

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
            title="Practice Inspections"
            subtitle="All practice sessions"
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
              <div className={styles.sessionsList}>
                {data.sessions.length === 0 ? (
                  <div className={styles.empty}>No practice sessions found</div>
                ) : (
                  data.sessions.map((session) => (
                    <Link
                      key={session.sessionId}
                      href={`/mock-session/${session.sessionId}?provider=${providerId}&facility=${facilityId}`}
                      className={styles.sessionCard}
                    >
                      <div className={styles.sessionHeader}>
                        <h3 className={styles.sessionTitle}>Session {session.sessionId}</h3>
                        <div className={`${styles.statusBadge} ${styles[session.status.toLowerCase()]}`}>
                          {session.status}
                        </div>
                      </div>
                      <div className={styles.sessionMeta}>
                        <span>Topic: {session.topicId}</span>
                        <span>Follow-ups: {session.followUpsUsed}/{session.maxFollowUps}</span>
                      </div>
                      <div className={styles.sessionDate}>
                        Created: {new Date(session.createdAt).toLocaleString()}
                        {session.completedAt && ` • Completed: ${new Date(session.completedAt).toLocaleString()}`}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
            evidence={(
              <div className={styles.snapshotPanel}>
                <h2 className={styles.sectionTitle}>Start a Practice Inspection</h2>
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
                    {creating ? 'Starting...' : 'Start Session'}
                  </button>
                </div>
                {createStatus && (
                  <div className={styles.statusMessage} aria-live="polite">
                    {createStatus}
                    {createdSessionId && (
                      <>
                        {' '}
                        <Link
                          className={styles.statusLink}
                          href={`/mock-session/${createdSessionId}?provider=${providerId}&facility=${facilityId}`}
                        >
                          Open session →
                        </Link>
                      </>
                    )}
                  </div>
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
