'use client';
export const dynamic = "force-dynamic";


/**
 * Findings List Page
 *
 * Displays all inspection findings for a provider.
 * Mock findings have visual separation (SYSTEM_MOCK badge).
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { FindingsListResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements, validateFindingForDisplay } from '@/lib/validators';
import styles from './page.module.css';

export default function FindingsPage() {
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');
  const severityDisplayMap: Record<string, string> = {
    CRITICAL: 'Urgent',
    HIGH: 'High Priority',
    MEDIUM: 'Medium Priority',
    LOW: 'Low Priority',
  };

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<FindingsListResponse | null>(null);
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
  }, [providerId, facilityId]);

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
            title="Action Items"
            subtitle={
              data.mode === 'REAL'
                ? 'Issues identified from your CQC inspection data'
                : 'Issues identified during your practice inspection'
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
                  <div className={styles.empty}>No action items found</div>
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
                            <div className={styles.originBadge}>Practice</div>
                          )}
                          <div className={styles.severityBadge}>
                            {severityDisplayMap[finding.severity] ?? finding.severity}
                          </div>
                        </div>
                      </div>
                      <p className={styles.findingDescription}>{finding.description}</p>
                      <div className={styles.findingMeta}>
                        <span>Area: {finding.topicId}</span>
                        <span>Regulation reference: {finding.regulationSectionId}</span>
                        <span>Priority score: {finding.compositeRiskScore}</span>
                      </div>
                      <div className={styles.findingEvidence}>
                        {finding.evidenceProvided.length} documents uploaded, {finding.evidenceMissing.length} still needed
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
            evidence={(
              <div className={styles.evidencePanel}>
                <h2 className={styles.sectionTitle}>Missing Documents</h2>
                {data.findings.length === 0 ? (
                  <div className={styles.empty}>No missing documents</div>
                ) : (
                  <ul className={styles.evidenceList}>
                    {data.findings.map((finding) => (
                      <li key={finding.id} className={styles.evidenceItem}>
                        <span>{finding.title}</span>
                        <span>
                          {finding.evidenceMissing.length} documents still needed
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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
