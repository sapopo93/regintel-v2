'use client';
export const dynamic = 'force-dynamic';

/**
 * Document Audit Page
 *
 * Dedicated workflow for auditing provider documents against CQC standards.
 * Shows full AI-generated audit results for each piece of uploaded evidence:
 * SAF statement ratings, compliance score, findings (with severity), and
 * prioritised corrections with example wording.
 *
 * Designed for consultants and providers who want to audit documentation
 * independently of a mock inspection.
 */

import { useEffect, useState } from 'react';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type {
  EvidenceListResponse,
  ProviderOverviewResponse,
  DocumentAuditResponse,
  EvidenceRecord,
} from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { EmptyState } from '@/components/layout/EmptyState';
import { FileSearch, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import styles from './page.module.css';

// ─── helpers ─────────────────────────────────────────────────────────────────

function safRatingClass(rating: string) {
  if (rating === 'MET') return styles.safMet;
  if (rating === 'PARTIALLY_MET') return styles.safPartial;
  if (rating === 'NOT_MET') return styles.safNotMet;
  return styles.safNa;
}

function safRatingLabel(rating: string) {
  const map: Record<string, string> = {
    MET: 'Met',
    PARTIALLY_MET: 'Partially Met',
    NOT_MET: 'Not Met',
    NOT_APPLICABLE: 'N/A',
  };
  return map[rating] ?? rating;
}

function severityClass(sev: string) {
  if (sev === 'CRITICAL') return styles.sevCritical;
  if (sev === 'HIGH') return styles.sevHigh;
  if (sev === 'MEDIUM') return styles.sevMedium;
  return styles.sevLow;
}

function priorityClass(p: string) {
  if (p === 'IMMEDIATE') return styles.priorityImmediate;
  if (p === 'THIS_WEEK') return styles.priorityWeek;
  return styles.priorityMonth;
}

function priorityLabel(p: string) {
  const map: Record<string, string> = {
    IMMEDIATE: 'Immediate',
    THIS_WEEK: 'This week',
    THIS_MONTH: 'This month',
  };
  return map[p] ?? p;
}

function riskLevelClass(level: string) {
  if (level === 'CRITICAL') return styles.sevCritical;
  if (level === 'HIGH') return styles.sevHigh;
  if (level === 'MEDIUM') return styles.sevMedium;
  return styles.sevLow;
}

function enforcementClass(likelihood: string) {
  if (likelihood === 'ALMOST_CERTAIN') return styles.enfAlmostCertain;
  if (likelihood === 'LIKELY') return styles.enfLikely;
  if (likelihood === 'POSSIBLE') return styles.enfPossible;
  return styles.enfUnlikely;
}

function enforcementLabel(likelihood: string) {
  const map: Record<string, string> = {
    ALMOST_CERTAIN: 'Almost Certain',
    LIKELY: 'Likely',
    POSSIBLE: 'Possible',
    UNLIKELY: 'Unlikely',
  };
  return map[likelihood] ?? likelihood;
}

function overallResultClass(r: string | undefined) {
  if (r === 'PASS') return styles.resultPass;
  if (r === 'NEEDS_IMPROVEMENT') return styles.resultAmber;
  if (r === 'CRITICAL_GAPS') return styles.resultCritical;
  return styles.resultPending;
}

function overallResultLabel(r: string | undefined) {
  if (r === 'PASS') return 'Pass';
  if (r === 'NEEDS_IMPROVEMENT') return 'Needs Improvement';
  if (r === 'CRITICAL_GAPS') return 'Critical Gaps';
  return 'Pending';
}

// ─── per-record expanded audit panel ─────────────────────────────────────────

function AuditDetail({ evidenceRecordId }: { evidenceRecordId: string }) {
  const [detail, setDetail] = useState<DocumentAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient
      .getDocumentAudit(evidenceRecordId)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [evidenceRecordId]);

  if (loading) return <div className={styles.detailLoading}>Loading full audit…</div>;
  if (error) return <div className={styles.detailError}>{error}</div>;
  if (!detail || detail.status !== 'COMPLETED' || !detail.result)
    return (
      <div className={styles.detailEmpty}>
        {detail?.status === 'PENDING'
          ? 'Audit in progress — check back shortly.'
          : detail?.status === 'FAILED'
          ? `Audit failed: ${detail.failureReason ?? 'unknown error'}`
          : 'No audit result available yet.'}
      </div>
    );

  const { result } = detail;

  return (
    <div className={styles.auditDetail}>
      {/* Summary */}
      <p className={styles.auditSummary}>{result.summary}</p>

      {/* SAF Statements */}
      {result.safStatements.length > 0 && (
        <section className={styles.detailSection}>
          <h4 className={styles.detailSectionTitle}>SAF Statement Ratings</h4>
          <div className={styles.safGrid}>
            {result.safStatements.map((s) => (
              <div key={s.statementId} className={styles.safRow}>
                <span className={`${styles.safBadge} ${safRatingClass(s.rating)}`}>
                  {safRatingLabel(s.rating)}
                </span>
                <div className={styles.safContent}>
                  <span className={styles.safName}>{s.statementName}</span>
                  {s.evidence && <span className={styles.safEvidence}>{s.evidence}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Findings */}
      {result.findings.length > 0 && (
        <section className={styles.detailSection}>
          <h4 className={styles.detailSectionTitle}>
            Findings ({result.findings.length})
          </h4>
          <div className={styles.findingsList}>
            {result.findings.map((f, i) => (
              <div key={i} className={styles.findingRow}>
                <span className={`${styles.severityBadge} ${severityClass(f.severity)}`}>
                  {f.severity}
                </span>
                <div className={styles.findingContent}>
                  <span className={styles.findingCategory}>{f.category}</span>
                  <p className={styles.findingDesc}>{f.description}</p>
                  {f.regulatoryReference && (
                    <span className={styles.findingRef}>{f.regulatoryReference}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Corrections */}
      {result.corrections.length > 0 && (
        <section className={styles.detailSection}>
          <h4 className={styles.detailSectionTitle}>
            Required Corrections ({result.corrections.length})
          </h4>
          <div className={styles.correctionsList}>
            {result.corrections.map((c, i) => (
              <div key={i} className={styles.correctionCard}>
                <div className={styles.correctionHeader}>
                  <span className={`${styles.priorityBadge} ${priorityClass(c.priority)}`}>
                    {priorityLabel(c.priority)}
                  </span>
                  <span className={styles.correctionRef}>{c.policyReference}</span>
                </div>
                <p className={styles.correctionFinding}><strong>Issue:</strong> {c.finding}</p>
                <p className={styles.correctionAction}><strong>Correction:</strong> {c.correction}</p>
                {c.exampleWording && (
                  <div className={styles.exampleWording}>
                    <span className={styles.exampleLabel}>Example wording:</span>
                    <p className={styles.exampleText}>{c.exampleWording}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Risk Matrix */}
      {result.riskMatrix && result.riskMatrix.length > 0 && (
        <section className={styles.detailSection}>
          <h4 className={styles.detailSectionTitle}>
            Regulatory Risk Assessment Matrix
          </h4>
          <div className={styles.riskMatrixTable}>
            <div className={styles.riskMatrixHeader}>
              <span className={styles.riskMatrixCol}>Domain</span>
              <span className={styles.riskMatrixCol}>Regulation</span>
              <span className={styles.riskMatrixCol}>Evidence</span>
              <span className={styles.riskMatrixCol}>Risk Level</span>
              <span className={styles.riskMatrixCol}>Enforcement Likelihood</span>
            </div>
            {result.riskMatrix.map((entry, i) => (
              <div key={i} className={styles.riskMatrixRow}>
                <span className={styles.riskMatrixCell}>{entry.domain}</span>
                <span className={styles.riskMatrixCell}>{entry.regulation}</span>
                <span className={`${styles.riskMatrixCell} ${styles.riskMatrixEvidence}`}>{entry.evidence}</span>
                <span className={styles.riskMatrixCell}>
                  <span className={`${styles.severityBadge} ${riskLevelClass(entry.riskLevel)}`}>
                    {entry.riskLevel}
                  </span>
                </span>
                <span className={styles.riskMatrixCell}>
                  <span className={`${styles.enforcementBadge} ${enforcementClass(entry.enforcementLikelihood)}`}>
                    {enforcementLabel(entry.enforcementLikelihood)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── per-record card ──────────────────────────────────────────────────────────

function AuditCard({ record }: { record: EvidenceRecord }) {
  const [expanded, setExpanded] = useState(false);
  const audit = record.documentAudit;

  const canExpand = audit?.status === 'COMPLETED';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardLeft}>
          <span className={styles.fileName}>{record.fileName}</span>
          <span className={styles.evidenceType}>{record.evidenceType.replace(/_/g, ' ')}</span>
        </div>
        <div className={styles.cardRight}>
          {audit ? (
            <>
              <span className={`${styles.resultBadge} ${overallResultClass(audit.overallResult)}`}>
                {overallResultLabel(audit.overallResult)}
              </span>
              {audit.complianceScore != null && (
                <span className={styles.scoreBadge}>{audit.complianceScore}%</span>
              )}
              {(audit.criticalFindings ?? 0) > 0 && (
                <span className={styles.criticalCount}>
                  {audit.criticalFindings} critical
                </span>
              )}
              {(audit.highFindings ?? 0) > 0 && (
                <span className={styles.highCount}>
                  {audit.highFindings} high
                </span>
              )}
            </>
          ) : (
            <span className={`${styles.resultBadge} ${styles.resultPending}`}>No audit</span>
          )}
          {canExpand && (
            <button
              className={styles.expandBtn}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? 'Hide' : 'Full audit'}
            </button>
          )}
        </div>
      </div>

      {audit?.summary && (
        <p className={styles.cardSummary}>{audit.summary}</p>
      )}

      {audit?.status === 'PENDING' && (
        <p className={styles.pendingNote}>Audit in progress — AI is reviewing this document.</p>
      )}

      {audit?.status === 'FAILED' && (
        <p className={styles.failedNote}>Audit failed: {audit.failureReason ?? 'unknown error'}</p>
      )}

      {expanded && canExpand && (
        <AuditDetail evidenceRecordId={record.evidenceRecordId} />
      )}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DocumentAuditPage() {
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<EvidenceListResponse | null>(null);
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
      apiClient.getEvidence(providerId, facilityId),
    ])
      .then(([overviewRes, evidenceRes]) => {
        validateConstitutionalRequirements(evidenceRes, { strict: true });
        setOverview(overviewRes);
        setData(evidenceRes);
      })
      .catch((e) => setError(e.message))
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

  // Separate records by audit status for a useful overview
  const completed = data.evidence.filter((e) => e.documentAudit?.status === 'COMPLETED');
  const pending = data.evidence.filter((e) => e.documentAudit?.status === 'PENDING');
  const failed = data.evidence.filter((e) => e.documentAudit?.status === 'FAILED');
  const noAudit = data.evidence.filter((e) => !e.documentAudit);

  const passCount = completed.filter((e) => e.documentAudit?.overallResult === 'PASS').length;
  const needsCount = completed.filter((e) => e.documentAudit?.overallResult === 'NEEDS_IMPROVEMENT').length;
  const criticalCount = completed.filter((e) => e.documentAudit?.overallResult === 'CRITICAL_GAPS').length;

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
            title="Document Audit"
            subtitle={`AI compliance review of ${data.totalCount} uploaded document${data.totalCount !== 1 ? 's' : ''}`}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <a
              href={`/evidence?provider=${providerId}&facility=${facilityId}`}
              className={styles.evidenceLink}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: 'var(--color-slate-900)', color: 'var(--color-white)', borderRadius: 'var(--radius-sm)', textDecoration: 'none', fontWeight: 600, fontSize: 'var(--text-sm)' }}
            >
              <Upload size={16} />
              Upload Evidence
            </a>
          </div>

          <DisclosurePanel
            summary={(
              <div className={styles.overviewPanel}>
                <h2 className={styles.overviewTitle}>Audit Overview</h2>
                <p className={styles.overviewDesc}>
                  Each document you upload is automatically reviewed by an AI auditor against CQC
                  standards. Results include SAF statement ratings, findings by severity, and
                  prioritised corrections with example wording — independent of any mock inspection.
                </p>

                {completed.length > 0 && (
                  <div className={styles.statsRow}>
                    <div className={`${styles.statBox} ${styles.statPass}`}>
                      <span className={styles.statNum}>{passCount}</span>
                      <span className={styles.statLabel}>Pass</span>
                    </div>
                    <div className={`${styles.statBox} ${styles.statAmber}`}>
                      <span className={styles.statNum}>{needsCount}</span>
                      <span className={styles.statLabel}>Needs Improvement</span>
                    </div>
                    <div className={`${styles.statBox} ${styles.statCritical}`}>
                      <span className={styles.statNum}>{criticalCount}</span>
                      <span className={styles.statLabel}>Critical Gaps</span>
                    </div>
                    {pending.length > 0 && (
                      <div className={`${styles.statBox} ${styles.statPending}`}>
                        <span className={styles.statNum}>{pending.length}</span>
                        <span className={styles.statLabel}>In Progress</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            evidence={(
              <div className={styles.cardList}>
                {data.evidence.length === 0 ? (
                  <EmptyState
                    icon={FileSearch}
                    title="No documents to audit"
                    description="Upload evidence documents from the Evidence page. Each document is automatically audited against CQC compliance standards."
                    action={
                      <a href={`/evidence?provider=${providerId}&facility=${facilityId}`} className={styles.evidenceLink}>
                        Go to Evidence →
                      </a>
                    }
                  />
                ) : (
                  data.evidence.map((record) => (
                    <AuditCard key={record.evidenceRecordId} record={record} />
                  ))
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
