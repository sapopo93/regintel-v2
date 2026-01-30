'use client';
export const dynamic = "force-dynamic";


/**
 * Provider Overview Page
 *
 * Constitutional requirements satisfied:
 * - Version: Topic Catalog v1, PRS Logic v1
 * - Hash: Both catalog and logic hashes displayed
 * - Time: Snapshot timestamp
 * - Domain: CQC/IMMIGRATION badge
 *
 * Facts only - no interpretation:
 * - Evidence coverage (percentage)
 * - Topics completed (count)
 * - Unanswered questions (count)
 * - Open findings (count)
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { SimulationModeBadge } from '@/components/mock/SimulationModeBadge';
import { apiClient } from '@/lib/api/client';
import type { ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function OverviewPage() {
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');

  const [data, setData] = useState<ProviderOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId || !facilityId) {
      setError('Provider and facility are required');
      setLoading(false);
      return;
    }

    apiClient.getProviderOverview(providerId, facilityId)
      .then((response) => {
        validateConstitutionalRequirements(response, { strict: true });
        setData(response);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, facilityId]);

  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.layout}>
        <div className={styles.error}>Error: {error || 'Failed to load data'}</div>
      </div>
    );
  }

  const isRealMode = data.mode === 'REAL';

  return (
    <SimulationFrame reportingDomain={data.reportingDomain}>
      <div className={styles.layout}>
        <Sidebar
          providerName={data.provider.providerName}
          snapshotDate={data.provider.asOf}
          status={data.provider.prsState}
          topicCatalogVersion={data.topicCatalogVersion}
          prsLogicVersion={data.prsLogicVersion}
          topicsCompleted={data.topicsCompleted}
          totalTopics={data.totalTopics}
        />

        <main className={styles.main}>
          <PageHeader
            title="Inspection Readiness Record"
            subtitle={`Provider: ${data.provider.providerName} · Facility: ${data.facility?.facilityName ?? 'Unknown'}`}
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

          <SimulationModeBadge reportingDomain={data.reportingDomain} />

          <DisclosurePanel
            summary={(
              <div className={styles.grid}>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>Evidence Coverage</div>
                  <div className={styles.cardValue}>{data.evidenceCoverage}%</div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'CQC evidence uploaded for regulatory ingestion' : 'Percentage of required evidence uploaded'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode
                      ? `Source: ${data.reportSource.type}:${data.reportSource.id}`
                      : `Calculated from Topic Catalog ${data.topicCatalogVersion} requirements`}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardLabel}>Topics Completed</div>
                  <div className={styles.cardValue}>
                    {data.topicsCompleted} / {data.totalTopics}
                  </div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'Regulatory topic mapping pending ingestion' : 'Mock inspection topics addressed'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode ? 'Awaiting regulatory ingestion' : 'Based on mock inspection sessions'}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardLabel}>Unanswered Questions</div>
                  <div className={styles.cardValue}>{data.unansweredQuestions}</div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'Regulatory questions unavailable until ingestion completes' : 'Questions requiring provider response'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode ? 'Regulatory ingestion pending' : 'Awaiting provider response'}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardLabel}>Open Findings</div>
                  <div className={styles.cardValue}>{data.openFindings}</div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'Regulatory findings available after ingestion' : 'Findings without remediation'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode
                      ? `Regulatory history (${data.reportingDomain})`
                      : `Generated via PRS Logic ${data.prsLogicVersion} (mock domain)`}
                  </div>
                </div>
              </div>
            )}
            evidence={(
              <div className={styles.providerInfo}>
                <h2 className={styles.sectionTitle}>Provider Details</h2>
                <dl className={styles.definitionList}>
                  <dt>Provider ID</dt>
                  <dd>{data.provider.providerId}</dd>

                  <dt>Facility ID</dt>
                  <dd>{data.facility?.id || 'Unknown'}</dd>

                  <dt>PRS State</dt>
                  <dd>{data.provider.prsState}</dd>

                  <dt>Registered Beds</dt>
                  <dd>{data.provider.registeredBeds}</dd>

                  <dt>Service Types</dt>
                  <dd>{data.provider.serviceTypes.join(', ')}</dd>

                  {data.facility && (
                    <>
                      <dt>Facility CQC Location ID</dt>
                      <dd>{data.facility.cqcLocationId}</dd>
                    </>
                  )}
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
        </main>
      </div>
    </SimulationFrame>
  );
}
