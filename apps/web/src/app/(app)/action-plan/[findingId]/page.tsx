'use client';
export const dynamic = "force-dynamic";

/**
 * Action Plan Detail Page
 *
 * Shows all actions for a specific finding with inline editing.
 * Actions come from both document audit corrections and topic templates.
 */

import { useEffect, useState, useCallback } from 'react';
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
import type { ActionPlanResponse, ActionRecord, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { formatTopicId } from '@/lib/format';
import styles from './page.module.css';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
};

const PRIORITY_CLASS: Record<string, string> = {
  HIGH: styles.priorityHigh,
  MEDIUM: styles.priorityMedium,
  LOW: styles.priorityLow,
};

function riskClass(score: number): string {
  if (score >= 70) return styles.riskHigh;
  if (score >= 40) return styles.riskMedium;
  return styles.riskLow;
}

function statusClass(status: string): string {
  const map: Record<string, string> = {
    OPEN: styles.statusOpen,
    IN_PROGRESS: styles.statusInProgress,
    COMPLETED: styles.statusCompleted,
    OVERDUE: styles.statusOverdue,
  };
  return map[status] ?? styles.statusOpen;
}

export default function ActionPlanDetailPage() {
  const params = useParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();
  const findingId = decodeURIComponent(params.findingId as string);

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<ActionPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(() => {
    if (!ready || !providerId || !facilityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getProviderOverview(providerId, facilityId),
      apiClient.getActionPlan(providerId, findingId),
    ])
      .then(([overviewResponse, planResponse]) => {
        validateConstitutionalRequirements(planResponse, { strict: true });
        setOverview(overviewResponse);
        setData(planResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, facilityId, findingId, ready]);

  useEffect(loadData, [loadData]);

  const handleStatusChange = async (action: ActionRecord, newStatus: 'IN_PROGRESS' | 'VERIFIED_CLOSED' | 'OPEN') => {
    if (!providerId || !data) return;

    // Optimistic update
    const prevActions = data.actions;
    const updatedActions = data.actions.map(a =>
      a.id === action.id ? { ...a, status: newStatus as ActionRecord['status'] } : a
    );
    setData({ ...data, actions: updatedActions });

    try {
      await apiClient.updateAction(providerId, action.id, { status: newStatus });
      // Reload to get server-computed timestamps
      loadData();
    } catch (err) {
      // Revert
      setData({ ...data, actions: prevActions });
      setActionErrors(prev => ({ ...prev, [action.id]: err instanceof Error ? err.message : 'Update failed' }));
    }
  };

  const handleFieldUpdate = async (actionId: string, field: string, value: string) => {
    if (!providerId) return;
    try {
      await apiClient.updateAction(providerId, actionId, { [field]: value });
      setActionErrors(prev => { const n = { ...prev }; delete n[actionId]; return n; });
    } catch (err) {
      setActionErrors(prev => ({ ...prev, [actionId]: err instanceof Error ? err.message : 'Update failed' }));
    }
  };

  const handleGenerate = async () => {
    if (!providerId) return;
    setGenerating(true);
    try {
      const result = await apiClient.generateActionPlan(providerId, findingId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate action plan');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className={styles.layout}><LoadingSkeleton variant="detail" /></div>;
  }

  if (error || !data || !overview) {
    return <div className={styles.layout}><ErrorState message={error || 'Failed to load data'} onRetry={loadData} /></div>;
  }

  const finding = data.finding;
  const actions = data.actions;
  const completed = actions.filter(a => a.status === 'VERIFIED_CLOSED').length;
  const total = actions.length;
  const computedStatus = data.planStatus;

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
            title="Action Plan"
            subtitle={formatTopicId(finding.topicId)}
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
            labels={{ evidence: 'Finding Context' }}
            summary={(
              <>
                {/* Finding context strip */}
                <div className={styles.findingContext}>
                  <div className={styles.findingContextRow}>
                    <span><strong>{formatTopicId(finding.topicId)}</strong></span>
                    <span>{finding.regulationSectionId}</span>
                    <span className={`${styles.riskBadge} ${riskClass(finding.compositeRiskScore)}`}>
                      Risk: {finding.compositeRiskScore}
                    </span>
                    <span>{finding.severity}</span>
                    <span>Evidence: {finding.evidenceProvided.length} provided, {finding.evidenceMissing.length} missing</span>
                    <span>{new Date(finding.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Plan status header */}
                {total > 0 && (
                  <div className={styles.planStatus}>
                    <div className={styles.planStatusLeft}>
                      <span className={`${styles.statusBadge} ${statusClass(computedStatus)}`}>
                        {STATUS_LABELS[computedStatus] ?? computedStatus}
                      </span>
                      <span className={styles.progressText}>
                        {completed} of {total} actions completed
                      </span>
                    </div>
                    <div className={styles.progressBarContainer}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action cards */}
                {total === 0 ? (
                  <div className={styles.emptyActions}>
                    <p>No action plan generated yet for this finding.</p>
                    <button
                      className={styles.generateButton}
                      onClick={handleGenerate}
                      disabled={generating}
                    >
                      {generating ? 'Generating...' : 'Generate Action Plan'}
                    </button>
                  </div>
                ) : (
                  <div className={styles.actionsList}>
                    {actions.map((action) => (
                      <div
                        key={action.id}
                        className={`${styles.actionCard} ${action.status === 'VERIFIED_CLOSED' ? styles.actionCardCompleted : ''}`}
                      >
                        <div className={styles.actionHeader}>
                          <h3 className={styles.actionTitle}>{action.title}</h3>
                          <div className={styles.actionBadges}>
                            <span className={styles.categoryBadge}>{action.category}</span>
                            <span className={`${styles.categoryBadge} ${PRIORITY_CLASS[action.priority] ?? ''}`}>{action.priority}</span>
                            {action.source === 'DOCUMENT_AUDIT' && (
                              <span className={styles.sourceBadge}>From document audit</span>
                            )}
                          </div>
                        </div>

                        <p className={styles.actionDescription}>{action.description}</p>

                        <div className={styles.actionFields}>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>Owner</span>
                            <input
                              type="text"
                              className={styles.fieldInput}
                              defaultValue={action.assignedTo ?? ''}
                              placeholder="Assign owner"
                              onBlur={(e) => handleFieldUpdate(action.id, 'assignedTo', e.target.value)}
                            />
                          </div>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>Due date</span>
                            <input
                              type="date"
                              className={styles.fieldInput}
                              defaultValue={action.targetCompletionDate?.split('T')[0] ?? ''}
                              onBlur={(e) => handleFieldUpdate(action.id, 'targetCompletionDate', e.target.value ? new Date(e.target.value).toISOString() : '')}
                            />
                          </div>
                        </div>

                        <div className={styles.notesField}>
                          <span className={styles.fieldLabel}>Notes</span>
                          <textarea
                            className={styles.notesInput}
                            defaultValue={action.notes ?? ''}
                            placeholder="Add notes..."
                            onBlur={(e) => handleFieldUpdate(action.id, 'notes', e.target.value)}
                          />
                        </div>

                        <div className={styles.actionFooter}>
                          <div>
                            {action.status === 'OPEN' && (
                              <button
                                className={`${styles.statusButton} ${styles.startButton}`}
                                onClick={() => handleStatusChange(action, 'IN_PROGRESS')}
                              >
                                Start
                              </button>
                            )}
                            {action.status === 'IN_PROGRESS' && (
                              <button
                                className={`${styles.statusButton} ${styles.completeButton}`}
                                onClick={() => handleStatusChange(action, 'VERIFIED_CLOSED')}
                              >
                                Mark Complete
                              </button>
                            )}
                            {action.status === 'VERIFIED_CLOSED' && (
                              <button
                                className={`${styles.statusButton} ${styles.reopenButton}`}
                                onClick={() => handleStatusChange(action, 'OPEN')}
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                          {action.completedAt && (
                            <span className={styles.completedAt}>
                              Completed {new Date(action.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>

                        {actionErrors[action.id] && (
                          <p className={styles.errorInline}>{actionErrors[action.id]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* All-complete banner */}
                {computedStatus === 'COMPLETED' && total > 0 && (
                  <div className={styles.completeBanner}>
                    <div className={styles.completeBannerTitle}>All actions have been addressed.</div>
                    <p className={styles.completeBannerText}>
                      Re-assess this area to confirm your improvement. A new mock inspection will generate a fresh finding and action plan, so you can track your progress over time.
                    </p>
                    <Link
                      href={`/mock-session?provider=${providerId}&facility=${facilityId}&topic=${finding.topicId}`}
                      className={styles.reassessLink}
                    >
                      Re-assess this area — start a new mock inspection
                    </Link>
                  </div>
                )}
              </>
            )}
            evidence={(
              <div>
                <h3>Finding Detail</h3>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-600)', whiteSpace: 'pre-line' }}>
                  {finding.description}
                </p>
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

          <div>
            <Link
              href={`/action-plan?provider=${providerId}&facility=${facilityId}`}
              className={styles.backLink}
            >
              ← Back to Action Plans
            </Link>
            {' · '}
            <Link
              href={`/findings?provider=${providerId}&facility=${facilityId}`}
              className={styles.backLink}
            >
              Back to Findings
            </Link>
          </div>
        </main>
      </div>
    </SimulationFrame>
  );
}
