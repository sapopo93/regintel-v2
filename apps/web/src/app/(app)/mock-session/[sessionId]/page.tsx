'use client';
export const dynamic = "force-dynamic";


/**
 * Mock Session Detail Page
 *
 * Displays a single mock inspection session.
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
import type { MockInspectionSession, ConstitutionalMetadata, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function MockSessionDetailPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');
  const sessionId = params.sessionId as string;

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<(MockInspectionSession & ConstitutionalMetadata) | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
      apiClient.getMockSession(providerId, sessionId, facilityId),
    ])
      .then(([overviewResponse, sessionResponse]) => {
        validateConstitutionalRequirements(sessionResponse, { strict: true });
        setOverview(overviewResponse);
        setData(sessionResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, facilityId, sessionId]);

  const handleSubmitAnswer = async () => {
    if (!providerId || !answer.trim()) {
      setError('Answer is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const updated = await apiClient.submitAnswer(providerId, sessionId, answer.trim());
      setData((prev) => prev ? { ...prev, ...updated } : prev);
      setAnswer('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
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
            title={`Session ${data.sessionId}`}
            subtitle="Practice inspection session detail"
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
                <h2 className={styles.sectionTitle}>Session Information</h2>
                <dl className={styles.definitionList}>
                  <dt>Session ID</dt>
                  <dd>{data.sessionId}</dd>

                  <dt>Topic ID</dt>
                  <dd>{data.topicId}</dd>

                  <dt>Status</dt>
                  <dd className={styles[data.status.toLowerCase()]}>{data.status}</dd>

                  <dt>Follow-ups Used</dt>
                  <dd>{data.followUpsUsed} / {data.maxFollowUps}</dd>

                  <dt>Created At</dt>
                  <dd>{new Date(data.createdAt).toLocaleString()}</dd>

                  {data.completedAt && (
                    <>
                      <dt>Completed At</dt>
                      <dd>{new Date(data.completedAt).toLocaleString()}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}
            evidence={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Provider Details</h2>
                <dl className={styles.definitionList}>
                  <dt>Provider ID</dt>
                  <dd>{data.providerSnapshot.providerId}</dd>

                  <dt>Provider Name</dt>
                  <dd>{data.providerSnapshot.providerName}</dd>

                  <dt>Recorded on</dt>
                  <dd>{data.providerSnapshot.asOf}</dd>

                  <dt>Regulatory Status</dt>
                  <dd>{data.providerSnapshot.prsState}</dd>

                  <dt>Registered Beds</dt>
                  <dd>{data.providerSnapshot.registeredBeds}</dd>

                  <dt>Service Types</dt>
                  <dd>{data.providerSnapshot.serviceTypes.join(', ')}</dd>
                </dl>
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

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Submit Answer</h2>
            <textarea
              className={styles.answerInput}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Provide a response to complete the session..."
              rows={4}
              data-testid="mock-session-answer"
            />
            <button
              className={styles.submitButton}
              onClick={handleSubmitAnswer}
              disabled={submitting || !answer.trim()}
              data-testid="primary-submit-answer"
            >
              {submitting ? 'Submitting...' : 'Submit Answer'}
            </button>
          </div>

          <div className={styles.actions}>
            <Link
              href={`/mock-session?provider=${providerId}&facility=${facilityId}`}
              className={styles.backButton}
            >
              ← Back to Sessions
            </Link>
          </div>
        </main>
      </div>
    </SimulationFrame>
  );
}
