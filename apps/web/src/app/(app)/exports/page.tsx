'use client';

/**
 * Exports Page
 *
 * Generate CSV/PDF exports of mock inspection results.
 * All exports include READINESS (MOCK) watermark and constitutional metadata.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import { getAuthRole, getAuthToken } from '@/lib/auth';
import type { ExportStatusResponse, ProviderOverviewResponse, ExportFormat } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function ExportsPage() {
  const searchParams = useSearchParams();
  const providerId = searchParams.get('provider');
  const facilityId = searchParams.get('facility');

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [statusData, setStatusData] = useState<ExportStatusResponse | null>(null);
  const [format, setFormat] = useState<ExportFormat>('BLUE_OCEAN_BOARD');
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!providerId || !facilityId) {
      return;
    }

    Promise.all([
      apiClient.getProviderOverview(providerId, facilityId),
      apiClient.getExportStatus(providerId, facilityId),
    ])
      .then(([overviewResponse, exportResponse]) => {
        validateConstitutionalRequirements(exportResponse, { strict: true });
        setOverview(overviewResponse);
        setStatusData(exportResponse);
      })
      .catch((err) => setLoadError(err.message));
  }, [providerId, facilityId]);

  const authRole = getAuthRole();
  const enableAuditExport = searchParams.get('enableAuditExport') === 'true';
  const allowAuditExport =
    authRole === 'FOUNDER' ||
    (enableAuditExport && process.env.NODE_ENV !== 'production');

  const formatLabel = (value: ExportFormat) => {
    if (value === 'BLUE_OCEAN_BOARD' || value === 'BLUE_OCEAN') {
      return 'Blue Ocean Report (Board Pack)';
    }
    if (value === 'BLUE_OCEAN_AUDIT') {
      return 'Blue Ocean Report (Audit Pack — Internal)';
    }
    if (value === 'CSV') return 'CSV (Spreadsheet)';
    if (value === 'PDF') return 'PDF (Document)';
    return value;
  };

  const availableFormats = statusData
    ? statusData.availableFormats.filter((option) => {
        if (option === 'BLUE_OCEAN_AUDIT') return allowAuditExport;
        return true;
      })
    : [];

  useEffect(() => {
    if (!statusData) return;
    if (!availableFormats.includes(format)) {
      setFormat(availableFormats[0] ?? 'PDF');
    }
  }, [statusData, availableFormats, format]);

  const handleExport = async () => {
    if (!providerId || !facilityId) {
      setExportError('No provider or facility selected');
      return;
    }

    setLoading(true);
    setExportError(null);
    setDownloadUrl(null);

    try {
      const response = await apiClient.generateExport(providerId, {
        facilityId,
        format,
        includeWatermark,
      });
      const token = getAuthToken();
      if (token) {
        setDownloadUrl(`${response.downloadUrl}?token=${encodeURIComponent(token)}`);
      } else {
        setDownloadUrl(response.downloadUrl);
      }
    } catch (err: any) {
      setExportError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!providerId || !facilityId) {
    return (
      <div className={styles.layout}>
        <div className={styles.error}>No provider or facility selected</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.layout}>
        <div className={styles.error}>Error: {loadError}</div>
      </div>
    );
  }

  if (!overview || !statusData) {
    return (
      <div className={styles.layout}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <SimulationFrame reportingDomain={statusData.reportingDomain}>
      <div className={styles.layout}>
        <Sidebar
          providerName={overview.provider.providerName}
          snapshotDate={overview.provider.asOf}
          status={overview.provider.prsState}
          topicCatalogVersion={statusData.topicCatalogVersion}
          prsLogicVersion={statusData.prsLogicVersion}
          topicsCompleted={overview.topicsCompleted}
          totalTopics={overview.totalTopics}
        />

        <main className={styles.main}>
          <PageHeader
            title="Export Readiness Report"
            subtitle={overview.facility
              ? `${overview.provider.providerName} - ${overview.facility.facilityName} | Generate export`
              : `${overview.provider.providerName} | Generate export`}
            topicCatalogVersion={statusData.topicCatalogVersion}
            topicCatalogHash={statusData.topicCatalogHash}
            prsLogicVersion={statusData.prsLogicVersion}
            prsLogicHash={statusData.prsLogicHash}
            snapshotTimestamp={statusData.snapshotTimestamp}
            domain={statusData.domain}
            reportingDomain={statusData.reportingDomain}
          />

          <DisclosurePanel
            summary={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Export Configuration</h2>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Format</label>
                  <div className={styles.radioGroup}>
                    {availableFormats.map((option) => (
                      <label key={option} className={styles.radio}>
                        <input
                          type="radio"
                          value={option}
                          checked={format === option}
                          onChange={(e) => setFormat(e.target.value as ExportFormat)}
                        />
                        <span>{formatLabel(option)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={includeWatermark}
                      onChange={(e) => setIncludeWatermark(e.target.checked)}
                    />
                    <span>Include watermark: {statusData.watermark}</span>
                  </label>
                </div>

                <button
                  className={styles.exportButton}
                  onClick={handleExport}
                  disabled={loading}
                  data-testid="primary-generate-export"
                >
                  {loading ? 'Generating...' : `Generate ${formatLabel(format)}`}
                </button>

                {exportError && (
                  <div className={styles.errorMessage}>
                    {exportError}
                    {(exportError.includes('No completed session') || exportError.includes('Conflict')) && (
                      <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                        💡 Tip: Complete a mock inspection session first. Navigate to "Mock Session" from the sidebar.
                      </div>
                    )}
                  </div>
                )}

                {downloadUrl && (
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Export Ready</h2>
                    <p className={styles.successMessage}>Your export has been generated.</p>
                    <a
                      href={downloadUrl}
                      download
                      className={styles.downloadButton}
                    >
                      Download {formatLabel(format)}
                    </a>
                  </div>
                )}
              </div>
            )}
            evidence={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Export Contents</h2>
                <ul className={styles.contentList}>
                  <li>Session metadata (ID, provider, versions, hashes)</li>
                  <li>Topic Catalog version and hash</li>
                  <li>PRS Logic Profile version and hash</li>
                  <li>All findings from mock sessions</li>
                  <li>Evidence coverage statistics</li>
                  <li>Watermark on every page/row (if enabled)</li>
                </ul>
                <div className={styles.warning}>
                  <strong>Note:</strong> Exports NEVER include regulatory history findings.
                  All exported findings have origin=SYSTEM_MOCK.
                </div>

                {statusData.latestExport && (
                  <div className={styles.latestExport}>
                    Latest export: {statusData.latestExport.exportId} ({statusData.latestExport.format})
                  </div>
                )}
              </div>
            )}
            trace={(
              <MetadataBar
                topicCatalogVersion={statusData.topicCatalogVersion}
                topicCatalogHash={statusData.topicCatalogHash}
                prsLogicVersion={statusData.prsLogicVersion}
                prsLogicHash={statusData.prsLogicHash}
                snapshotTimestamp={statusData.snapshotTimestamp}
                domain={statusData.domain}
                reportingDomain={statusData.reportingDomain}
              />
            )}
          />
        </main>
      </div>
    </SimulationFrame>
  );
}
