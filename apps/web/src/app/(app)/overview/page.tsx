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
      window.location.href = '/facilities';
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
          latestRating={data.facility?.latestRating}
          topicCatalogVersion={data.topicCatalogVersion}
          prsLogicVersion={data.prsLogicVersion}
          topicsCompleted={data.topicsCompleted}
          totalTopics={data.totalTopics}
        />

        <main className={styles.main}>
          <PageHeader
            title="Compliance Dashboard"
            subtitle={`Organisation: ${data.provider.providerName} · Location: ${data.facility?.facilityName ?? 'Unknown'}`}
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
                  <div className={styles.cardLabel}>Documents Uploaded</div>
                  <div className={styles.cardValue}>{data.evidenceCoverage}%</div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'Documents submitted for CQC review' : 'How much of your required documentation is uploaded'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode
                      ? 'Verified against CQC requirements'
                      : 'Based on standard CQC inspection requirements'}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardLabel}>Compliance Areas Reviewed</div>
                  <div className={styles.cardValue}>
                    {data.topicsCompleted} / {data.totalTopics}
                  </div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'Being reviewed against CQC standards' : 'Practice inspection areas completed'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode ? 'CQC review in progress' : 'Based on your practice inspection sessions'}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardLabel}>Outstanding Questions</div>
                  <div className={styles.cardValue}>{data.unansweredQuestions}</div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'Questions will appear once your CQC review begins' : 'Questions that still need your response'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode ? 'CQC review pending' : 'Awaiting your response'}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardLabel}>Items Needing Attention</div>
                  <div className={styles.cardValue}>{data.openFindings}</div>
                  <div className={styles.cardNote}>
                    {isRealMode ? 'Will appear once your CQC review is complete' : 'Issues that have not yet been resolved'}
                  </div>
                  <div className={styles.cardProvenance}>
                    {isRealMode
                      ? 'From your CQC inspection history'
                      : 'From your practice inspection'}
                  </div>
                </div>
              </div>
            )}
            evidence={(
              <div className={styles.providerInfo}>
                <h2 className={styles.sectionTitle}>Organisation Details</h2>
                <dl className={styles.definitionList}>
                  <dt>CQC Provider Reference</dt>
                  <dd>{data.provider.providerId}</dd>

                  <dt>Location Reference</dt>
                  <dd>{data.facility?.id || 'Unknown'}</dd>

                  <dt>Current CQC Rating</dt>
                  <dd>{data.provider.prsState}</dd>

                  <dt>Registered Capacity</dt>
                  <dd>{data.provider.registeredBeds}</dd>

                  <dt>Service Types</dt>
                  <dd>{data.provider.serviceTypes.join(', ')}</dd>

                  {data.facility && (
                    <>
                      <dt>CQC Location Reference</dt>
                      <dd>{data.facility.cqcLocationId}</dd>
                    </>
                  )}
                </dl>
              </div>
            )}
            trace={(
              <div style={{ padding: '16px', color: '#666', fontSize: '14px' }}>
                <p><strong>Compliance Framework:</strong> {data.topicCatalogVersion}</p>
                <p><strong>Rules Engine:</strong> {data.prsLogicVersion}</p>
                <p><strong>Data as of:</strong> {new Date(data.snapshotTimestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p><strong>Inspection Type:</strong> {data.mode === 'REAL' ? 'Live CQC Data' : 'Practice Inspection'}</p>
              </div>
            )}
          />
        </main>
      </div>
    </SimulationFrame>
  );
}
