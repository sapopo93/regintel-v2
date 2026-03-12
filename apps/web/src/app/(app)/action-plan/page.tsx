'use client';
export const dynamic = "force-dynamic";

/**
 * Action Plans List Page
 *
 * Shows all action plans (grouped by finding) for the current facility.
 * Each plan card shows topic, progress, and computed status.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { EmptyState } from '@/components/layout/EmptyState';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { ClipboardList } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { ActionPlansListResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { formatTopicId } from '@/lib/format';
import styles from './page.module.css';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
};

export default function ActionPlansPage() {
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<ActionPlansListResponse | null>(null);
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
      apiClient.listActionPlans(providerId, facilityId),
    ])
      .then(([overviewResponse, plansResponse]) => {
        validateConstitutionalRequirements(plansResponse, { strict: true });
        setOverview(overviewResponse);
        setData(plansResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, facilityId, ready]);

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

  const statusClass = (status: string) => {
    const map: Record<string, string> = {
      OPEN: styles.statusOpen,
      IN_PROGRESS: styles.statusInProgress,
      COMPLETED: styles.statusCompleted,
      OVERDUE: styles.statusOverdue,
    };
    return map[status] ?? styles.statusOpen;
  };

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
            title="Action Plans"
            subtitle="Improvement actions generated from mock inspections and document audits"
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
            evidence={<div />}
            summary={(
              <div className={styles.plansList}>
                {data.plans.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No action plans yet"
                    description="Complete a mock inspection to generate your first action plan."
                    action={
                      <Link href={`/mock-session?provider=${providerId}&facility=${facilityId}`} style={{ color: 'var(--color-primary, #2563eb)' }}>
                        Start a Mock Inspection
                      </Link>
                    }
                  />
                ) : (
                  data.plans.map((plan) => {
                    const docAuditCount = plan.actions.filter(a => a.source === 'DOCUMENT_AUDIT').length;
                    return (
                      <Link
                        key={plan.findingId}
                        href={`/action-plan/${encodeURIComponent(plan.findingId)}?provider=${providerId}&facility=${facilityId}`}
                        className={styles.planCard}
                      >
                        <div className={styles.planHeader}>
                          <h3 className={styles.planTitle}>{formatTopicId(plan.topicId)}</h3>
                          <span className={`${styles.statusBadge} ${statusClass(plan.computedStatus)}`}>
                            {STATUS_LABELS[plan.computedStatus] ?? plan.computedStatus}
                          </span>
                        </div>

                        <div className={styles.planMeta}>
                          <span>{plan.completedActions} of {plan.totalActions} actions completed</span>
                          {docAuditCount > 0 && (
                            <span className={styles.sourceTag}>{docAuditCount} from document audit</span>
                          )}
                        </div>

                        <div className={styles.progressRow}>
                          <div className={styles.progressBar}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${plan.totalActions > 0 ? (plan.completedActions / plan.totalActions) * 100 : 0}%` }}
                            />
                          </div>
                          <span>{plan.totalActions > 0 ? Math.round((plan.completedActions / plan.totalActions) * 100) : 0}%</span>
                        </div>
                      </Link>
                    );
                  })
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
