'use client';
export const dynamic = "force-dynamic";


/**
 * Mock Session Detail Page
 *
 * Displays a single mock inspection session with full conversation history,
 * progress tracking, and guided UX for first-time users.
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
import type { MockInspectionSession, ConstitutionalMetadata, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { formatTopicId } from '@/lib/format';
import styles from './page.module.css';

type ConversationTurn = { role: 'assistant' | 'user'; content: string };

const PRS_LABELS: Record<string, string> = {
  NEW_PROVIDER: 'New provider',
  ESTABLISHED: 'No active enforcement',
  SPECIAL_MEASURES: 'Special Measures',
  ENFORCEMENT_ACTION: 'Enforcement action',
  RATING_INADEQUATE: 'Rated: Inadequate',
  RATING_REQUIRES_IMPROVEMENT: 'Rated: Requires Improvement',
  REOPENED_SERVICE: 'Reopened service',
  MERGED_SERVICE: 'Merged service',
  STABLE: 'Standard regulation',
};

export default function MockSessionDetailPage() {
  const params = useParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();
  const sessionId = params.sessionId as string;

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<(MockInspectionSession & ConstitutionalMetadata) | null>(null);
  const [topic, setTopic] = useState<{ title: string; questionMode: string; regulationSectionId: string } | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
      apiClient.getMockSession(providerId, sessionId, facilityId),
    ])
      .then(async ([overviewResponse, sessionResponse]) => {
        validateConstitutionalRequirements(sessionResponse, { strict: true });
        setOverview(overviewResponse);
        setData(sessionResponse);
        try {
          const topicData = await apiClient.getTopic(providerId, sessionResponse.topicId, facilityId);
          setTopic(topicData);
        } catch {
          // Topic fetch is non-critical
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, facilityId, sessionId, ready]);

  const handleSubmitAnswer = async () => {
    if (!providerId || !answer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await apiClient.submitAnswer(providerId, sessionId, answer.trim());
      setData((prev) => prev ? { ...prev, ...updated } : prev);
      setAnswer('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit your answer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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

  const conversationHistory = (data.conversationHistory ?? []) as ConversationTurn[];
  const totalQuestions = data.maxFollowUps + 1;
  const currentQuestionNumber = data.followUpsUsed + 1;
  const questionsRemaining = data.maxFollowUps - data.followUpsUsed;

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
            title="Mock inspection session"
            subtitle="Mock inspection session detail"
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
            labels={{ evidence: 'Provider Context' }}
            summary={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Session Information</h2>
                <dl className={styles.definitionList}>
                  <dt>Inspection Area</dt>
                  <dd>{topic?.title ?? formatTopicId(data.topicId)}</dd>

                  <dt>Status</dt>
                  <dd className={styles[data.status.toLowerCase()]}>{data.status}</dd>

                  <dt>Progress</dt>
                  <dd>{data.followUpsUsed} of {totalQuestions} questions answered</dd>

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
                  <dt>Provider Name</dt>
                  <dd>{data.providerSnapshot.providerName}</dd>

                  <dt>Recorded on</dt>
                  <dd>{new Date(data.providerSnapshot.asOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>

                  <dt>Regulatory Status</dt>
                  <dd>{PRS_LABELS[data.providerSnapshot.prsState] ?? data.providerSnapshot.prsState}</dd>

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

          {data.status === 'IN_PROGRESS' ? (
            <>
              {data.followUpsUsed === 0 && (
                <div className={styles.sessionIntro}>
                  <span className={styles.introIcon}>👋</span>
                  <div>
                    <strong>Welcome to your mock inspection</strong>
                    <p>The inspector will ask you {totalQuestions} questions about <em>{topic?.title ?? formatTopicId(data.topicId)}</em>. Answer honestly and in detail — this is your chance to find gaps before a real CQC visit. Your answers are private and will not affect your official record.</p>
                  </div>
                </div>
              )}

              <div className={styles.progressBar}>
                <span className={styles.progressText}>Question {currentQuestionNumber} of {totalQuestions}</span>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${(data.followUpsUsed / data.maxFollowUps) * 100}%` }}
                  />
                </div>
                <span className={styles.progressRemaining}>
                  {questionsRemaining === 0
                    ? 'Final question'
                    : `${questionsRemaining} more after this`}
                </span>
              </div>

              {questionsRemaining === 0 && (
                <div className={styles.finalQuestionBanner}>
                  This is your final question — give as much detail as you can.
                </div>
              )}

              <div className={styles.questionCard}>
                <div className={styles.inspectorLabel}>
                  <span className={styles.inspectorBadge}>Inspector</span>
                  {topic && <span className={styles.questionRef}>{topic.regulationSectionId} — {topic.title}</span>}
                </div>
                <p className={styles.questionPrompt} data-testid="mock-session-question">
                  {data.currentQuestion || 'Loading question...'}
                </p>
              </div>

              {conversationHistory.length > 0 && (
                <div className={styles.conversationHistory}>
                  <h3 className={styles.historyTitle}>What you&apos;ve covered so far</h3>
                  {conversationHistory
                    .reduce<Array<{ q: ConversationTurn; a?: ConversationTurn }>>((pairs, turn, idx, arr) => {
                      if (turn.role === 'assistant') {
                        pairs.push({ q: turn, a: arr[idx + 1] });
                      }
                      return pairs;
                    }, [])
                    .map((pair, i) => (
                      <div key={i} className={styles.exchangePair}>
                        <div className={styles.inspectorTurn}>
                          <span className={styles.turnLabel}>Inspector asked</span>
                          <p>{pair.q.content}</p>
                        </div>
                        {pair.a && (
                          <div className={styles.userTurn}>
                            <span className={styles.turnLabel}>Your response</span>
                            <p>{pair.a.content}</p>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}

              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Your Response</h2>
                <p className={styles.guidance}>
                  Be specific. Name the documents you have, describe the process you follow, and give an example where you can. Vague answers will generate findings — detailed answers show compliance.
                </p>
                <textarea
                  className={styles.answerInput}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="e.g. We have a risk assessment policy reviewed in January 2026. Staff complete individual risk assessments on admission and review them monthly or after any incident. Our last audit in December showed 98% compliance..."
                  aria-label="Your response to the inspector's question"
                  rows={7}
                  data-testid="mock-session-answer"
                  disabled={submitting}
                />
                {!answer.trim() && !submitting && (
                  <p className={styles.answerHint}>Write at least a sentence before submitting.</p>
                )}
                <div className={styles.submitRow}>
                  <button
                    className={styles.submitButton}
                    onClick={handleSubmitAnswer}
                    disabled={submitting || !answer.trim()}
                    data-testid="primary-submit-answer"
                  >
                    {submitting
                      ? (currentQuestionNumber < totalQuestions
                          ? 'Loading next question...'
                          : 'Completing your inspection...')
                      : (questionsRemaining > 0
                          ? 'Submit and continue to next question →'
                          : 'Submit my final response and complete inspection')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.completedSection}>
              <div className={styles.completedIcon}>✓</div>
              <h2 className={styles.completedTitle}>Mock Inspection Complete</h2>
              <p className={styles.completedSummary}>
                You&apos;ve completed {totalQuestions} questions on <strong>{topic?.title ?? formatTopicId(data.topicId)}</strong>.
              </p>
              <p className={styles.completedNote}>
                A finding has been generated based on your responses. It shows your compliance position, any evidence gaps, and what a real inspector would look for. Use it to prepare before your next CQC visit.
              </p>
              <div className={styles.completedActions}>
                {data.findingId ? (
                  <Link
                    href={`/action-plan/${encodeURIComponent(data.findingId)}?provider=${providerId}&facility=${facilityId}`}
                    className={styles.primaryActionButton}
                  >
                    View your action plan →
                  </Link>
                ) : (
                  <Link
                    href={`/findings?provider=${providerId}&facility=${facilityId}`}
                    className={styles.primaryActionButton}
                  >
                    View my results →
                  </Link>
                )}
                <Link
                  href={`/mock-session?provider=${providerId}&facility=${facilityId}`}
                  className={styles.secondaryActionButton}
                >
                  Inspect another area
                </Link>
              </div>
              <p className={styles.completedFootnote}>
                These results are private and will not appear on your official CQC record.
              </p>
            </div>
          )}

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
