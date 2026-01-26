'use client';

/**
 * Finding Detail Page
 *
 * Progressive disclosure: Summary → Evidence → Trace layers.
 * Mock findings have SYSTEM_MOCK badge and darker border.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { TraceLayer } from '@/components/disclosure/TraceLayer';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { FindingDetailResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements, validateFindingForDisplay } from '@/lib/validators';
import styles from './page.module.css';

export default function FindingDetailPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');
  const findingId = params.findingId as string;

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<FindingDetailResponse | null>(null);
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
      apiClient.getFinding(providerId, findingId),
    ])
      .then(([overviewResponse, findingResponse]) => {
        validateConstitutionalRequirements(findingResponse, { strict: true });
        validateFindingForDisplay(findingResponse.finding);
        setOverview(overviewResponse);
        setData(findingResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, facilityId, findingId]);

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

  const isMock = data.finding.origin === 'SYSTEM_MOCK';

  return (
    <SimulationFrame reportingDomain={data.reportingDomain}>
      <div className={`${styles.layout} ${isMock ? styles.mockLayout : ''}`}>
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
            title={data.finding.title}
            subtitle="Finding detail"
            topicCatalogVersion={data.topicCatalogVersion}
            topicCatalogHash={data.topicCatalogHash}
            prsLogicVersion={data.prsLogicVersion}
            prsLogicHash={data.prsLogicHash}
            snapshotTimestamp={data.snapshotTimestamp}
            domain={data.domain}
            reportingDomain={data.reportingDomain}
          />

          <DisclosurePanel
            summary={(
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Summary</h2>
                  {isMock && <div className={styles.originBadge}>SYSTEM_MOCK</div>}
                </div>

                <dl className={styles.definitionList}>
                  <dt>Finding ID</dt>
                  <dd>{data.finding.id}</dd>

                  <dt>Severity</dt>
                  <dd>{data.finding.severity}</dd>

                  <dt>Composite Risk Score</dt>
                  <dd>{data.finding.compositeRiskScore}</dd>

                  <dt>Topic ID</dt>
                  <dd>{data.finding.topicId}</dd>

                  <dt>Regulation Section</dt>
                  <dd>{data.finding.regulationSectionId}</dd>

                  <dt>Origin</dt>
                  <dd>{data.finding.origin}</dd>

                  <dt>Reporting Domain</dt>
                  <dd>{data.finding.reportingDomain}</dd>
                </dl>

                <div className={styles.description}>
                  <h3>Description</h3>
                  <p>{data.finding.description}</p>
                </div>

                <div className={styles.regulationText}>
                  <h3>Regulation Text</h3>
                  <p>{data.regulationText}</p>
                </div>

                {data.policyClause && (
                  <div className={styles.policyClause}>
                    <h3>Policy Clause</h3>
                    <p>{data.policyClause}</p>
                  </div>
                )}
              </div>
            )}
            evidence={(
              <div className={styles.evidenceDetails}>
                <div className={styles.evidenceSection}>
                  <h3>Evidence Required</h3>
                  <ul>
                    {data.finding.evidenceRequired.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className={styles.evidenceSection}>
                  <h3>Evidence Provided</h3>
                  {data.finding.evidenceProvided.length === 0 ? (
                    <p className={styles.empty}>None</p>
                  ) : (
                    <ul>
                      {data.finding.evidenceProvided.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className={styles.evidenceSection}>
                  <h3>Evidence Missing</h3>
                  {data.finding.evidenceMissing.length === 0 ? (
                    <p className={styles.empty}>None</p>
                  ) : (
                    <ul>
                      {data.finding.evidenceMissing.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            trace={(
              <TraceLayer
                regulationSectionId={data.finding.regulationSectionId}
                topicCatalogVersion={data.topicCatalogVersion}
                topicCatalogHash={data.topicCatalogHash}
                prsLogicVersion={data.prsLogicVersion}
                prsLogicHash={data.prsLogicHash}
                deterministicHash={data.finding.deterministicHash}
              />
            )}
          />

          <div className={styles.actions}>
            <Link
              href={`/findings?provider=${providerId}&facility=${facilityId}`}
              className={styles.backButton}
            >
              ← Back to Findings
            </Link>
          </div>
        </main>
      </div>
    </SimulationFrame>
  );
}
