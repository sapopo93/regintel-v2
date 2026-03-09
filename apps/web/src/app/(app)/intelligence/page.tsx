'use client';
export const dynamic = "force-dynamic";

/**
 * CQC Intelligence Page
 *
 * Shows risk signals and outstanding insights from CQC inspections of
 * similar providers. Provider-level view (no facility context required).
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireProvider } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { apiClient } from '@/lib/api/client';
import type { CqcIntelligenceResponse, CqcIntelligenceAlert, ProviderDashboardResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { useToast } from '@/components/toast/ToastProvider';
import styles from './page.module.css';

type TabType = 'all' | 'risk' | 'outstanding';

function getCoverageClass(percent: number): string {
  if (percent < 30) return styles.coverageLow;
  if (percent < 60) return styles.coverageMedium;
  return styles.coverageHigh;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function IntelligencePage() {
  const searchParams = useSearchParams();
  const { providerId, ready } = useRequireProvider();

  const [data, setData] = useState<CqcIntelligenceResponse | null>(null);
  const [providerName, setProviderName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabType>('all');
  const [polling, setPolling] = useState(false);
  const toast = useToast();

  const loadData = () => {
    if (!ready || !providerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getCqcIntelligence(providerId),
      apiClient.getProviderDashboard(providerId).catch(() => null),
    ])
      .then(([response, dashResponse]) => {
        validateConstitutionalRequirements(response, { strict: true });
        setData(response);
        if (dashResponse) setProviderName(dashResponse.providerName);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, ready]);

  const handleDismiss = async (alertId: string) => {
    if (!providerId) return;
    try {
      await apiClient.dismissCqcAlert(providerId, alertId);
      loadData();
    } catch (err: any) {
      toast.error(`Failed to dismiss alert: ${err.message}`);
    }
  };

  const handlePoll = async () => {
    setPolling(true);
    try {
      await apiClient.pollCqcIntelligence();
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPolling(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.layout}>
        <ErrorState message={error || 'Failed to load intelligence'} onRetry={loadData} />
      </div>
    );
  }

  const filteredAlerts = data.alerts.filter((alert) => {
    if (tab === 'risk') return alert.intelligenceType === 'RISK_SIGNAL';
    if (tab === 'outstanding') return alert.intelligenceType === 'OUTSTANDING_SIGNAL';
    return true;
  });

  return (
    <div className={styles.layout}>
      <Sidebar
        providerName={providerName}
        snapshotDate={data.snapshotTimestamp}
        topicCatalogVersion={data.topicCatalogVersion}
        prsLogicVersion={data.prsLogicVersion}
      />

      <main className={styles.main}>
        <PageHeader
          title="CQC Intelligence"
          subtitle="Alerts from CQC inspections of similar providers"
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

        <div className={styles.pollSection}>
          <button
            className={styles.pollButton}
            onClick={handlePoll}
            disabled={polling}
          >
            {polling ? 'Polling CQC...' : 'Refresh Intelligence'}
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={tab === 'all' ? styles.tabActive : styles.tab}
            onClick={() => setTab('all')}
          >
            All
            <span className={`${styles.tabBadge} ${styles.badgeRisk}`}>
              {data.alerts.length}
            </span>
          </button>
          <button
            className={tab === 'risk' ? styles.tabActive : styles.tab}
            onClick={() => setTab('risk')}
          >
            Risk Signals
            <span className={`${styles.tabBadge} ${styles.badgeRisk}`}>
              {data.summary.riskCount}
            </span>
          </button>
          <button
            className={tab === 'outstanding' ? styles.tabActive : styles.tab}
            onClick={() => setTab('outstanding')}
          >
            Outstanding Insights
            <span className={`${styles.tabBadge} ${styles.badgeOutstanding}`}>
              {data.summary.outstandingCount}
            </span>
          </button>
        </div>

        {/* Alert Cards */}
        {filteredAlerts.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyTitle}>No intelligence alerts yet</div>
            <div className={styles.emptyDescription}>
              Alerts are generated when CQC publishes inspection reports for providers in your service type.
              Click &quot;Refresh Intelligence&quot; to check for new reports.
            </div>
          </div>
        ) : (
          <div className={styles.alertList}>
            {filteredAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDismiss={() => handleDismiss(alert.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AlertCard({ alert, onDismiss }: { alert: CqcIntelligenceAlert; onDismiss: () => void }) {
  const isRisk = alert.intelligenceType === 'RISK_SIGNAL';

  return (
    <div className={isRisk ? styles.alertCardRisk : styles.alertCardOutstanding}>
      <div className={styles.alertHeader}>
        <span className={isRisk ? styles.typeBadgeRisk : styles.typeBadgeOutstanding}>
          {isRisk ? 'Risk Signal' : 'Outstanding Insight'}
        </span>
        <span className={`${styles.severityBadge} ${
          alert.severity === 'HIGH' ? styles.severityHigh :
          alert.severity === 'MEDIUM' ? styles.severityMedium :
          styles.severityLow
        }`}>
          {alert.severity}
        </span>
      </div>

      <div className={styles.alertSource}>
        {alert.sourceLocationName} — inspected {formatDate(alert.reportDate)}
      </div>

      <div className={styles.alertQs}>
        {alert.keyQuestion} &middot; {alert.qualityStatementId}: {alert.qualityStatementTitle}
      </div>

      <div className={styles.alertFinding}>
        {alert.findingText}
      </div>

      <div className={styles.alertFooter}>
        <span className={`${styles.coverageBadge} ${getCoverageClass(alert.providerCoveragePercent)}`}>
          Your coverage: {Math.round(alert.providerCoveragePercent)}%
        </span>
        <button className={styles.dismissButton} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
