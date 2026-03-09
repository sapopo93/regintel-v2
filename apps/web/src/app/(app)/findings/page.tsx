'use client';
export const dynamic = "force-dynamic";


/**
 * Findings List Page
 *
 * Displays all inspection findings for a provider.
 * Practice findings have visual separation.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { FindingsListResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { ORIGIN_LABELS } from '@/lib/constants';
import { validateConstitutionalRequirements, validateFindingForDisplay } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { EmptyState } from '@/components/layout/EmptyState';
import { FileSearch } from 'lucide-react';
import styles from './page.module.css';

export default function FindingsPage() {
  const searchParams = useSearchParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<FindingsListResponse | null>(null);
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
      apiClient.getFindings(providerId, facilityId),
    ])
      .then(([overviewResponse, findingsResponse]) => {
        validateConstitutionalRequirements(findingsResponse, { strict: true });
        findingsResponse.findings.forEach((finding) => validateFindingForDisplay(finding));
        setOverview(overviewResponse);
        setData(findingsResponse);
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
            title="Inspection Findings"
            subtitle={
              data.mode === 'REAL'
                ? 'Regulatory findings (ingestion pending)'
                : 'All findings from practice inspections'
            }
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
              <div className={styles.findingsList}>
                {data.findings.length === 0 ? (
                  <EmptyState
                    icon={FileSearch}
                    title="No findings found"
                    description="Findings are generated during practice inspections."
                    action={
                      <Link href={`/mock-session?provider=${providerId}&facility=${facilityId}`} style={{ color: 'var(--color-primary, #2563eb)' }}>
                        Start a Practice Inspection
                      </Link>
                    }
                  />
                ) : (
                  data.findings.map((finding) => (
                    <Link
                      key={finding.id}
                      href={`/findings/${finding.id}?provider=${providerId}&facility=${facilityId}`}
                      className={`${styles.findingCard} ${finding.origin === 'SYSTEM_MOCK' ? styles.mock : ''}`}
                    >
                      <div className={styles.findingHeader}>
                        <h3 className={styles.findingTitle}>{finding.title}</h3>
                        <div className={styles.badges}>
                          {finding.origin === 'SYSTEM_MOCK' && (
                            <div className={styles.originBadge}>{ORIGIN_LABELS.SYSTEM_MOCK}</div>
                          )}
                          <div className={styles.severityBadge}>{finding.severity}</div>
                        </div>
                      </div>
                      <p className={styles.findingDescription}>{finding.description}</p>
                      <div className={styles.findingMeta}>
                        <span>Topic: {finding.topicId}</span>
                        <span>Regulation: {finding.regulationSectionId}</span>
                        <span>Risk Score: {finding.compositeRiskScore}</span>
                      </div>
                      <div className={styles.findingEvidence}>
                        Evidence: {finding.evidenceProvided.length} provided, {finding.evidenceMissing.length} missing
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
            evidence={(
              <div className={styles.evidencePanel}>
                <h2 className={styles.sectionTitle}>Evidence Gaps</h2>
                {data.findings.length === 0 ? (
                  <div className={styles.empty}>No evidence gaps reported</div>
                ) : (
                  <ul className={styles.evidenceList}>
                    {data.findings.map((finding) => (
                      <li key={finding.id} className={styles.evidenceItem}>
                        <span>{finding.title}</span>
                        <span>
                          Missing: {finding.evidenceMissing.length}
                        </span>
                      </li>
                    ))}
                  </ul>
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
