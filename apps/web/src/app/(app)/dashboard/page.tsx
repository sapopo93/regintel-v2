'use client';
export const dynamic = "force-dynamic";

/**
 * Provider Dashboard Page
 *
 * Provider-level view showing all facilities sorted by readiness (worst first).
 * Color-coded cards: red (<50%), amber (50-79%), green (80%+).
 *
 * Constitutional requirements satisfied:
 * - Version: Topic Catalog + PRS Logic versions displayed
 * - Hash: Both catalog and logic hashes displayed
 * - Time: Snapshot timestamp
 * - Domain: CQC/IMMIGRATION badge
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequireProvider } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { EmptyState } from '@/components/layout/EmptyState';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { Building2 } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { ProviderDashboardResponse, FacilitySummary, CqcIntelligenceResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

function getReadinessLevel(score: number): 'red' | 'amber' | 'green' {
  if (score < 50) return 'red';
  if (score < 80) return 'amber';
  return 'green';
}

function getDaysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDaysSince(dateStr: string | null): string {
  const days = getDaysSince(dateStr);
  if (days === null) return 'No activity';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { providerId, ready } = useRequireProvider();

  const [data, setData] = useState<ProviderDashboardResponse | null>(null);
  const [intelligence, setIntelligence] = useState<CqcIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    if (!ready || !providerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getProviderDashboard(providerId),
      apiClient.getCqcIntelligence(providerId).catch(() => null),
    ])
      .then(([dashResponse, intelResponse]) => {
        validateConstitutionalRequirements(dashResponse, { strict: true });
        setData(dashResponse);
        setIntelligence(intelResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, ready]);

  if (loading) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="cards" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="cards" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.layout}>
        <ErrorState message={error || 'Failed to load dashboard'} onRetry={loadData} />
      </div>
    );
  }

  const sortedFacilities = [...data.facilities].sort(
    (a, b) => a.readinessScore - b.readinessScore
  );

  const handleFacilityClick = (facilityId: string) => {
    router.push(`/results?provider=${providerId}&facility=${facilityId}`);
  };

  const lastActivity = (facility: FacilitySummary): string => {
    const dates = [facility.lastEvidenceUploadDate, facility.lastMockSessionDate].filter(Boolean) as string[];
    if (dates.length === 0) return 'No activity';
    const latest = dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    return formatDaysSince(latest);
  };

  return (
    <div className={styles.layout}>
      <Sidebar
        providerName={data.providerName}
        snapshotDate={data.snapshotTimestamp}
        topicCatalogVersion={data.topicCatalogVersion}
        prsLogicVersion={data.prsLogicVersion}
      />

      <main className={styles.main}>
        <PageHeader
          title="Provider Dashboard"
          subtitle={`${data.providerName} - ${data.totals.facilities} locations`}
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

        {/* Totals Summary */}
        <section className={styles.totalsSection} data-testid="dashboard-totals">
          <div className={styles.totalsGrid}>
            <div className={styles.totalCard}>
              <div className={styles.totalLabel}>Total Locations</div>
              <div className={styles.totalValue}>{data.totals.facilities}</div>
            </div>
            <div className={styles.totalCard}>
              <div className={styles.totalLabel}>Average Readiness</div>
              <div className={styles.totalValue}>
                <span className={styles[`readinessText${getReadinessLevel(data.totals.averageReadiness).charAt(0).toUpperCase() + getReadinessLevel(data.totals.averageReadiness).slice(1)}` as keyof typeof styles]}>
                  {Math.round(data.totals.averageReadiness)}%
                </span>
              </div>
            </div>
            <div className={styles.totalCard}>
              <div className={styles.totalLabel}>Open Findings</div>
              <div className={`${styles.totalValue} ${data.totals.totalFindings.critical > 0 ? styles.severityCritical : ''}`}>
                {data.totals.totalFindings.critical + data.totals.totalFindings.high + data.totals.totalFindings.medium + data.totals.totalFindings.low}
              </div>
            </div>
          </div>
          {data.totals.facilitiesNeedingAttention > 0 && (
            <div className={styles.attentionBanner} data-testid="attention-banner">
              {data.totals.facilitiesNeedingAttention} location{data.totals.facilitiesNeedingAttention !== 1 ? 's' : ''} need{data.totals.facilitiesNeedingAttention === 1 ? 's' : ''} attention
            </div>
          )}
        </section>

        {/* CQC Intelligence Summary */}
        {intelligence && (intelligence.summary.riskCount > 0 || intelligence.summary.outstandingCount > 0) && (
          <section style={{ margin: '0 0 1.5rem', padding: '1rem 1.25rem', border: '1px solid var(--border, #e0e0e0)', borderRadius: '8px', background: 'var(--bg-card, #fff)' }} data-testid="intelligence-summary">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>CQC Intelligence</div>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem' }}>
                  {intelligence.summary.riskCount > 0 && (
                    <span style={{ color: '#dc2626' }}>
                      {intelligence.summary.riskCount} risk signal{intelligence.summary.riskCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {intelligence.summary.outstandingCount > 0 && (
                    <span style={{ color: '#d97706' }}>
                      {intelligence.summary.outstandingCount} outstanding insight{intelligence.summary.outstandingCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <Link
                href={`/intelligence?provider=${providerId}`}
                style={{ color: 'var(--primary, #2563eb)', textDecoration: 'none', fontSize: '0.85rem' }}
              >
                View all
              </Link>
            </div>
          </section>
        )}

        {/* Expiring Evidence */}
        {data.expiringEvidence.length > 0 && (
          <section className={styles.expiringSection} data-testid="expiring-evidence">
            <h2 className={styles.sectionTitle}>Expiring Evidence</h2>
            <div className={styles.expiringList}>
              {data.expiringEvidence.map((item) => (
                <div
                  key={item.evidenceRecordId}
                  className={`${styles.expiringItem} ${item.isOverdue ? styles.expiringOverdue : ''}`}
                  data-testid={`expiring-item-${item.evidenceRecordId}`}
                >
                  <div className={styles.expiringDetails}>
                    <span className={styles.expiringFileName}>{item.fileName}</span>
                    <span className={styles.expiringMeta}>
                      {item.facilityName} &middot; {item.evidenceType}
                    </span>
                  </div>
                  <div className={styles.expiringStatus}>
                    {item.isOverdue ? (
                      <span className={styles.overdueTag}>Overdue</span>
                    ) : (
                      <span className={styles.expiryTag}>
                        {item.daysUntilExpiry} day{item.daysUntilExpiry !== 1 ? 's' : ''} left
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Facility Cards */}
        <section className={styles.facilitiesSection} data-testid="facility-grid">
          <h2 className={styles.sectionTitle}>Locations by Readiness</h2>
          {sortedFacilities.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No locations registered yet"
              description="Register your first location to start tracking readiness."
              action={
                <Link href={`/facilities?provider=${providerId}`} style={{ color: 'var(--color-primary, #2563eb)', textDecoration: 'none', fontSize: '0.9rem' }}>
                  Go to Locations
                </Link>
              }
            />
          ) : (
            <div className={styles.facilityGrid}>
              {sortedFacilities.map((facility) => {
                const level = getReadinessLevel(facility.readinessScore);
                return (
                  <div
                    key={facility.facilityId}
                    className={`${styles.facilityCard} ${styles[`facilityCard${level.charAt(0).toUpperCase() + level.slice(1)}`]}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleFacilityClick(facility.facilityId)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFacilityClick(facility.facilityId); } }}
                    data-testid={`facility-card-${facility.facilityId}`}
                  >
                    <div className={styles.cardHeader}>
                      <h3 className={styles.facilityName}>{facility.facilityName}</h3>
                      <div className={`${styles.readinessBadge} ${styles[`badge${level.charAt(0).toUpperCase() + level.slice(1)}`]}`}>
                        {Math.round(facility.readinessScore)}%
                      </div>
                    </div>

                    <div className={styles.cardMetrics}>
                      <div className={styles.metric}>
                        <span className={styles.metricLabel}>Evidence Coverage</span>
                        <span className={styles.metricValue}>{Math.round(facility.evidenceCoverage)}%</span>
                      </div>
                      <div className={styles.metric}>
                        <span className={styles.metricLabel}>Critical Findings</span>
                        <span className={`${styles.metricValue} ${facility.findingsBySeverity.critical > 0 ? styles.severityCritical : ''}`}>
                          {facility.findingsBySeverity.critical}
                        </span>
                      </div>
                      <div className={styles.metric}>
                        <span className={styles.metricLabel}>Last Activity</span>
                        <span className={styles.metricValue}>{lastActivity(facility)}</span>
                      </div>
                      <div className={styles.metric}>
                        <span className={styles.metricLabel}>Mock Sessions</span>
                        <span className={styles.metricValue}>{facility.completedMockSessions}</span>
                      </div>
                    </div>

                    {facility.needsAttention && facility.attentionReasons.length > 0 && (
                      <div className={styles.attentionCallout} data-testid={`attention-${facility.facilityId}`}>
                        <span className={styles.attentionIcon}>Needs Attention</span>
                        <ul className={styles.attentionReasons}>
                          {facility.attentionReasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
