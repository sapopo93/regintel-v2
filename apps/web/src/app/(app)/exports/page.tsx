'use client';
export const dynamic = "force-dynamic";


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

  const isRealMode = statusData.mode === 'REAL';

  return (
    <SimulationFrame reportingDomain={statusData.reportingDomain}>
      <div className={styles.layout}>
        <Sidebar
          providerName={overview.provider.providerName}
          snapshotDate={overview.provider.asOf}
          status={overview.provider.prsState}
          latestRating={overview.facility?.latestRating}
          topicCatalogVersion={statusData.topicCatalogVersion}
          prsLogicVersion={statusData.prsLogicVersion}
          topicsCompleted={overview.topicsCompleted}
          totalTopics={overview.totalTopics}
        />

        <main className={styles.main}>
          <PageHeader
            title="Download Reports"
            subtitle={overview.facility
              ? `${overview.provider.providerName} - ${overview.facility.facilityName}`
              : `${overview.provider.providerName}`}
            topicCatalogVersion={statusData.topicCatalogVersion}
            topicCatalogHash={statusData.topicCatalogHash}
            prsLogicVersion={statusData.prsLogicVersion}
            prsLogicHash={statusData.prsLogicHash}
            snapshotTimestamp={statusData.snapshotTimestamp}
            domain={statusData.domain}
            reportingDomain={statusData.reportingDomain}
            mode={statusData.mode}
            reportSource={statusData.reportSource}
            snapshotId={statusData.snapshotId}
            ingestionStatus={statusData.ingestionStatus}
          />

          <DisclosurePanel
            summary={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Choose Your Report Format</h2>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Report Format</label>
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
                    <span>Include "Practice Inspection" watermark on every page</span>
                  </label>
                </div>

                <button
                  className={styles.exportButton}
                  onClick={handleExport}
                  disabled={loading}
                  data-testid="primary-generate-export"
                >
                  {loading ? 'Preparing your report...' : `Download ${formatLabel(format)}`}
                </button>

                {exportError && (
                  <div className={styles.errorMessage}>
                    {exportError}
                    {!isRealMode && (exportError.includes('No completed session') || exportError.includes('Conflict')) && (
                      <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                        Please complete a practice inspection session first. You can find this in the left menu under "Mock Inspection".
                      </div>
                    )}
                    {isRealMode && exportError.includes('Regulatory exports') && (
                      <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                        CQC reports are only available in Blue Ocean format.
                      </div>
                    )}
                  </div>
                )}

                {downloadUrl && (
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Your Report is Ready</h2>
                    <p className={styles.successMessage}>Your report has been prepared and is ready to download.</p>
                    <a
                      href={downloadUrl}
                      download
                      className={styles.downloadButton}
                    >
                      Download Your Report
                    </a>
                  </div>
                )}
              </div>
            )}
            evidence={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>What is included in this report</h2>
                <ul className={styles.contentList}>
                  <li>Inspection session details</li>
                  <li>Compliance framework version</li>
                  <li>Assessment rules version</li>
                  <li>{isRealMode ? 'CQC inspection findings (if available)' : 'All findings from your practice inspection'}</li>
                  <li>Document upload summary</li>
                  <li>"Practice Inspection" watermark on every page (if enabled)</li>
                </ul>
                <div className={styles.warning}>
                  {isRealMode ? (
                    <>
                      <strong>Note:</strong> This report uses your official CQC inspection data only.
                      Practice inspection findings are not included.
                    </>
                  ) : (
                    <>
                      <strong>Note:</strong> This report is for practice purposes only.
                      It does not contain or affect your official CQC inspection record.
                    </>
                  )}
                </div>

                {statusData.latestExport && (
                  <div className={styles.latestExport}>
                    Last downloaded report: {statusData.latestExport.exportId} — {statusData.latestExport.format}
                  </div>
                )}
              </div>
            )}
            trace={(
              <div style={{ padding: '16px', color: '#666', fontSize: '14px' }}>
                <p><strong>Compliance Framework:</strong> {statusData.topicCatalogVersion}</p>
                <p><strong>Rules Engine:</strong> {statusData.prsLogicVersion}</p>
                <p><strong>Data as of:</strong> {new Date(statusData.snapshotTimestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p><strong>Inspection Type:</strong> {statusData.mode === 'REAL' ? 'Live CQC Data' : 'Practice Inspection'}</p>
              </div>
            )}
          />
        </main>
      </div>
    </SimulationFrame>
  );
}
