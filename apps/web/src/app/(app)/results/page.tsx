'use client';
export const dynamic = "force-dynamic";

/**
 * Results Page
 *
 * Consolidated inspection readiness view combining:
 * - Readiness score (topic completion + evidence + SAF 34 coverage)
 * - SAF 34 Quality Statement coverage grid
 * - Risk summary by severity
 * - Evidence gaps
 * - Next steps
 *
 * Constitutional requirements satisfied:
 * - Version: Topic Catalog v1, PRS Logic v1
 * - Hash: Both catalog and logic hashes displayed
 * - Time: Snapshot timestamp
 * - Domain: CQC
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type {
  ProviderOverviewResponse,
  FindingsListResponse,
  Saf34CoverageResponse,
} from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import styles from './page.module.css';

interface ResultsData {
  overview: ProviderOverviewResponse;
  findings: FindingsListResponse;
  saf34: Saf34CoverageResponse;
}

export default function ResultsPage() {
  useSearchParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();

  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    if (!providerId || !facilityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getProviderOverview(providerId, facilityId),
      apiClient.getFindings(providerId, facilityId),
      apiClient.getSaf34Coverage(providerId, facilityId),
    ])
      .then(([overview, findings, saf34]) => {
        validateConstitutionalRequirements(overview, { strict: true });
        validateConstitutionalRequirements(findings, { strict: true });
        validateConstitutionalRequirements(saf34, { strict: true });
        setData({ overview, findings, saf34 });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, facilityId]);

  if (!ready) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.layout}>
        <ErrorState message={error || 'Failed to load results'} onRetry={loadData} />
      </div>
    );
  }

  const { overview, findings, saf34 } = data;

  // Compute readiness score (weighted average)
  const topicScore = overview.totalTopics > 0
    ? (overview.topicsCompleted / overview.totalTopics) * 100
    : 0;
  const evidenceScore = overview.evidenceCoverage;
  const saf34Score = saf34.overall.percentage;
  const readinessScore = Math.round((topicScore + evidenceScore + saf34Score) / 3);

  // Severity counts
  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings.findings) {
    if (f.severity in severityCounts) {
      severityCounts[f.severity as keyof typeof severityCounts]++;
    }
  }

  // Evidence gaps from SAF34
  const gaps = saf34.statements.filter((s) => !s.covered);

  // Build next steps
  const nextSteps: string[] = [];
  const remainingTopics = overview.totalTopics - overview.topicsCompleted;
  if (remainingTopics > 0) {
    nextSteps.push(`Complete ${remainingTopics} remaining inspection area${remainingTopics > 1 ? 's' : ''}`);
  }
  if (gaps.length > 0) {
    const gapKqs = [...new Set(gaps.map((g) => g.keyQuestion))];
    nextSteps.push(`Address ${gaps.length} uncovered Quality Statement${gaps.length > 1 ? 's' : ''} across ${gapKqs.join(', ')}`);
  }
  if (severityCounts.CRITICAL > 0) {
    nextSteps.push(`Resolve ${severityCounts.CRITICAL} critical finding${severityCounts.CRITICAL > 1 ? 's' : ''} immediately`);
  }
  if (severityCounts.HIGH > 0) {
    nextSteps.push(`Address ${severityCounts.HIGH} high-severity finding${severityCounts.HIGH > 1 ? 's' : ''}`);
  }
  if (overview.evidenceCoverage < 100) {
    nextSteps.push(`Upload evidence to improve coverage from ${overview.evidenceCoverage}% to 100%`);
  }
  if (nextSteps.length === 0) {
    nextSteps.push('All areas covered — review results and schedule your practice inspection');
  }

  function getFillClass(pct: number): string {
    if (pct >= 80) return styles.fillGreen;
    if (pct >= 50) return styles.fillAmber;
    return styles.fillRed;
  }

  return (
    <div className={styles.layout}>
      <Sidebar
        providerName={overview.provider.providerName}
        snapshotDate={overview.snapshotTimestamp}
        status={overview.provider.prsState}
        topicCatalogVersion={overview.topicCatalogVersion}
        prsLogicVersion={overview.prsLogicVersion}
        topicsCompleted={overview.topicsCompleted}
        totalTopics={overview.totalTopics}
      />

      <main className={styles.main}>
        <PageHeader
          title="Inspection Readiness"
          subtitle={`${overview.provider.providerName} · ${overview.facility?.facilityName ?? 'Unknown'}`}
          topicCatalogVersion={overview.topicCatalogVersion}
          topicCatalogHash={overview.topicCatalogHash}
          prsLogicVersion={overview.prsLogicVersion}
          prsLogicHash={overview.prsLogicHash}
          snapshotTimestamp={overview.snapshotTimestamp}
          domain={overview.domain}
          reportingDomain={overview.reportingDomain}
          mode={overview.mode}
          reportSource={overview.reportSource}
          snapshotId={overview.snapshotId}
          ingestionStatus={overview.ingestionStatus}
        />

        <MetadataBar
          topicCatalogVersion={overview.topicCatalogVersion}
          topicCatalogHash={overview.topicCatalogHash}
          prsLogicVersion={overview.prsLogicVersion}
          prsLogicHash={overview.prsLogicHash}
          snapshotTimestamp={overview.snapshotTimestamp}
          domain={overview.domain}
          reportingDomain={overview.reportingDomain}
          mode={overview.mode}
          reportSource={overview.reportSource}
          snapshotId={overview.snapshotId}
          ingestionStatus={overview.ingestionStatus}
        />

        {/* Overview Summary Cards */}
        <section className={styles.overviewCards}>
          <div className={styles.overviewCard}>
            <div className={styles.overviewCardLabel}>Evidence Coverage</div>
            <div className={styles.overviewCardValue}>{overview.evidenceCoverage}%</div>
            <div className={styles.overviewCardNote}>Percentage of required evidence uploaded</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.overviewCardLabel}>Topics Completed</div>
            <div className={styles.overviewCardValue}>{overview.topicsCompleted} / {overview.totalTopics}</div>
            <div className={styles.overviewCardNote}>Inspection areas addressed</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.overviewCardLabel}>Unanswered Questions</div>
            <div className={styles.overviewCardValue}>{overview.unansweredQuestions}</div>
            <div className={styles.overviewCardNote}>Questions requiring provider response</div>
          </div>
          <div className={styles.overviewCard}>
            <div className={styles.overviewCardLabel}>Open Findings</div>
            <div className={styles.overviewCardValue}>{overview.openFindings}</div>
            <div className={styles.overviewCardNote}>Findings without remediation</div>
          </div>
        </section>

        {/* Provider Details */}
        <section className={styles.providerDetails}>
          <h3 className={styles.providerDetailsTitle}>Provider Details</h3>
          <dl className={styles.providerDetailsList}>
            <dt>PRS State</dt>
            <dd>{overview.provider.prsState}</dd>
            <dt>Registered Beds</dt>
            <dd>{overview.provider.registeredBeds}</dd>
            <dt>Service Types</dt>
            <dd>{overview.provider.serviceTypes.join(', ')}</dd>
            {overview.facility && (
              <>
                <dt>Facility CQC Location ID</dt>
                <dd>{overview.facility.cqcLocationId}</dd>
              </>
            )}
          </dl>
        </section>

        <SimulationFrame>
          {/* 1. Readiness Score */}
          <section className={styles.readinessSection}>
            <h2 className={styles.readinessTitle}>Overall Readiness</h2>
            <div className={styles.readinessGauge}>
              <span className={styles.readinessScore}>
                {readinessScore}<span className={styles.readinessUnit}>%</span>
              </span>
            </div>
            <div className={styles.readinessBreakdown}>
              <div className={styles.readinessBreakdownItem}>
                <span className={styles.readinessBreakdownValue}>{Math.round(topicScore)}%</span>
                Inspection Areas
              </div>
              <div className={styles.readinessBreakdownItem}>
                <span className={styles.readinessBreakdownValue}>{evidenceScore}%</span>
                Evidence
              </div>
              <div className={styles.readinessBreakdownItem}>
                <span className={styles.readinessBreakdownValue}>{saf34Score}%</span>
                SAF 34 Coverage
              </div>
            </div>
          </section>

          {/* 2. SAF 34 Coverage */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              SAF 34 Quality Statement Coverage ({saf34.overall.covered}/{saf34.overall.total})
            </h2>

            <div className={styles.keyQuestionGrid}>
              {saf34.keyQuestions.map((kq) => (
                <div key={kq.keyQuestion} className={styles.keyQuestionCard}>
                  <div className={styles.keyQuestionLabel}>{kq.label}</div>
                  <div className={styles.keyQuestionCount}>
                    {kq.covered}/{kq.total}
                  </div>
                  <div className={styles.keyQuestionBar}>
                    <div
                      className={`${styles.keyQuestionFill} ${getFillClass(kq.percentage)}`}
                      style={{ width: `${kq.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <table className={styles.qsTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Quality Statement</th>
                  <th>Key Question</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {saf34.statements.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.title}</td>
                    <td>{s.keyQuestion}</td>
                    <td>
                      <span className={`${styles.qsBadge} ${s.covered ? styles.covered : styles.gap}`}>
                        {s.covered ? 'Covered' : 'Gap'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 3. Risk Summary */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Risk Summary ({findings.totalCount} finding{findings.totalCount !== 1 ? 's' : ''})
            </h2>
            <div className={styles.riskGrid}>
              <div className={`${styles.riskCard} ${styles.severityCritical}`}>
                <div className={styles.riskCount}>{severityCounts.CRITICAL}</div>
                <div className={styles.riskLabel}>Critical</div>
              </div>
              <div className={`${styles.riskCard} ${styles.severityHigh}`}>
                <div className={styles.riskCount}>{severityCounts.HIGH}</div>
                <div className={styles.riskLabel}>High</div>
              </div>
              <div className={`${styles.riskCard} ${styles.severityMedium}`}>
                <div className={styles.riskCount}>{severityCounts.MEDIUM}</div>
                <div className={styles.riskLabel}>Medium</div>
              </div>
              <div className={`${styles.riskCard} ${styles.severityLow}`}>
                <div className={styles.riskCount}>{severityCounts.LOW}</div>
                <div className={styles.riskLabel}>Low</div>
              </div>
            </div>
          </section>

          {/* 4. Evidence Gaps */}
          {gaps.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Quality Statement Gaps ({gaps.length})
              </h2>
              <div className={styles.gapList}>
                {gaps.map((g) => (
                  <div key={g.id} className={styles.gapItem}>
                    <span className={styles.gapIcon}>!</span>
                    <span>
                      <strong>{g.id}</strong> — {g.title} ({g.keyQuestion})
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. Next Steps */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Next Steps</h2>
            <div className={styles.nextSteps}>
              {nextSteps.map((step, i) => (
                <div key={i} className={styles.stepItem}>
                  <span className={styles.stepNumber}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </section>
        </SimulationFrame>
      </main>
    </div>
  );
}
