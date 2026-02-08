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
import type { MockInspectionSession, ConstitutionalMetadata, ProviderOverviewResponse, AIInsightsResponse } from '@/lib/api/types';
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
  const [insights, setInsights] = useState<AIInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
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

  // Fetch AI insights (advisory only) when session is available
  useEffect(() => {
    if (!providerId || !data) return;

    setInsightsLoading(true);
    setInsightsError(null);

    apiClient.getAIInsights(providerId, sessionId)
      .then((response) => {
        setInsights(response);
      })
      .catch((err) => {
        // AI insights are optional/advisory - don't block the page
        setInsightsError(err.message || 'AI insights unavailable');
      })
      .finally(() => setInsightsLoading(false));
  }, [providerId, sessionId, data]);

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
                <h2 className={styles.sectionTitle}>Provider Snapshot</h2>
                <dl className={styles.definitionList}>
                  <dt>Provider ID</dt>
                  <dd>{data.providerSnapshot.providerId}</dd>

                  <dt>Provider Name</dt>
                  <dd>{data.providerSnapshot.providerName}</dd>

                  <dt>As Of</dt>
                  <dd>{data.providerSnapshot.asOf}</dd>

                  <dt>PRS State</dt>
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

          {/* AI Insights Section (Advisory Only) */}
          <div className={styles.insightsSection} data-testid="ai-insights-section">
            <div className={styles.insightsHeader}>
              <h2 className={styles.sectionTitle}>AI Insights</h2>
              <span className={styles.advisoryBadge}>Advisory Only</span>
              {insights?.isFallback && (
                <span className={styles.fallbackBadge}>Using Fallback</span>
              )}
            </div>

            {insightsLoading && (
              <div className={styles.insightsLoading}>Loading AI insights...</div>
            )}

            {insightsError && (
              <div className={styles.insightsError}>{insightsError}</div>
            )}

            {insights && !insightsLoading && (
              <>
                {insights.insights.length > 0 ? (
                  <ul className={styles.insightsList}>
                    {insights.insights.map((insight, index) => (
                      <li
                        key={index}
                        className={`${styles.insightItem} ${styles[insight.type]}`}
                      >
                        <div className={styles.insightType}>{insight.type.replace('_', ' ')}</div>
                        <div className={styles.insightContent}>{insight.content}</div>
                        <div className={styles.insightConfidence}>
                          Confidence: {Math.round(insight.confidence * 100)}%
                          {insight.regulationRef && (
                            <span className={styles.insightRegRef}> | {insight.regulationRef}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.insightsLoading}>No insights available for this session</div>
                )}

                {insights.riskIndicators.length > 0 && (
                  <div className={styles.riskIndicators}>
                    <div className={styles.insightType}>Risk Indicators</div>
                    <div className={styles.riskIndicatorsList}>
                      {insights.riskIndicators.map((indicator, index) => (
                        <span
                          key={index}
                          className={`${styles.riskIndicator} ${styles[indicator.severity.toLowerCase()]}`}
                        >
                          {indicator.indicator}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {insights.suggestedFollowUp && (
                  <div className={styles.suggestedFollowUp}>
                    <div className={styles.suggestedFollowUpLabel}>Suggested Follow-up</div>
                    <div className={styles.insightContent}>{insights.suggestedFollowUp}</div>
                  </div>
                )}

                {insights.fallbackReason && (
                  <div className={styles.insightsError}>
                    Fallback reason: {insights.fallbackReason}
                  </div>
                )}
              </>
            )}
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
