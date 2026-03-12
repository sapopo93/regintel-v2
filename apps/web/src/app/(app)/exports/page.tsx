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
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import { getAuthRole } from '@/lib/auth';
import type { ExportStatusResponse, ProviderOverviewResponse, ExportFormat, OutputFormat } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import styles from './page.module.css';

export default function ExportsPage() {
  const searchParams = useSearchParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [statusData, setStatusData] = useState<ExportStatusResponse | null>(null);
  const [format, setFormat] = useState<ExportFormat>('BLUE_OCEAN_BOARD');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('pdf');
  const [includeWatermark, setIncludeWatermark] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadReady, setDownloadReady] = useState(false);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadPageData = () => {
    if (!ready || !providerId || !facilityId) {
      return;
    }
    setLoadError(null);
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
  };

  useEffect(loadPageData, [providerId, facilityId, ready]);

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
    if (value === 'INSPECTOR_PACK') {
      return 'Inspector Evidence Pack';
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
    setDownloadReady(false);
    setDownloadPath(null);

    try {
      const response = await apiClient.generateExport(providerId, {
        facilityId,
        format,
        includeWatermark,
        outputFormat: format === 'CSV' ? 'csv' : outputFormat,
      });
      // Store the API path — download happens via authenticated fetch, not a bare <a href>
      setDownloadPath(response.downloadUrl);
      setDownloadReady(true);
    } catch (err: any) {
      setExportError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadPath) return;
    setDownloading(true);
    setExportError(null);
    try {
      const { blob, filename } = await apiClient.downloadFile(downloadPath);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      setExportError(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (!ready) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.layout}>
        <ErrorState message={loadError} onRetry={loadPageData} />
      </div>
    );
  }

  if (!overview || !statusData) {
    return (
      <div className={styles.layout}>
        <LoadingSkeleton variant="page" />
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
            mode={statusData.mode}
            reportSource={statusData.reportSource}
            snapshotId={statusData.snapshotId}
            ingestionStatus={statusData.ingestionStatus}
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

                {format !== 'CSV' && (
                  <div className={styles.formGroup}>
                    <label className={styles.label}>File Format</label>
                    <div className={styles.radioGroup}>
                      <label className={styles.radio}>
                        <input
                          type="radio"
                          value="pdf"
                          checked={outputFormat === 'pdf'}
                          onChange={() => setOutputFormat('pdf')}
                        />
                        <span>PDF</span>
                      </label>
                      <label className={styles.radio}>
                        <input
                          type="radio"
                          value="docx"
                          checked={outputFormat === 'docx'}
                          onChange={() => setOutputFormat('docx')}
                        />
                        <span>Word (DOCX)</span>
                      </label>
                    </div>
                  </div>
                )}

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
                    {!isRealMode && (exportError.includes('No completed session') || exportError.includes('Conflict')) && (
                      <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                        Tip: Complete a practice inspection first. Use "Practice Inspection" in the sidebar.
                      </div>
                    )}
                    {isRealMode && exportError.includes('Regulatory exports') && (
                      <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                        💡 Tip: Regulatory exports are available only as Blue Ocean reports.
                      </div>
                    )}
                  </div>
                )}

                {downloadReady && (
                  <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Export Ready</h2>
                    <p className={styles.successMessage}>Your export has been generated.</p>
                    <button
                      onClick={handleDownload}
                      disabled={downloading}
                      className={styles.downloadButton}
                    >
                      {downloading ? 'Downloading…' : `Download ${formatLabel(format)}`}
                    </button>
                  </div>
                )}
              </div>
            )}
            evidence={(
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Export Contents</h2>
                <ul className={styles.contentList}>
                  <li>Session details (provider, location, and inspection date)</li>
                  <li>Relevant CQC quality statement references</li>
                  <li>Risk profile summary used for scoring</li>
                  <li>{isRealMode ? 'Regulatory findings (if available)' : 'All findings from practice inspections'}</li>
                  <li>Evidence coverage statistics</li>
                  <li>Watermark on every page/row (if enabled)</li>
                </ul>
                <div className={styles.warning}>
                  {isRealMode ? (
                    <>
                      <strong>Note:</strong> Regulatory exports are sourced from uploaded CQC evidence and regulatory findings only.
                      Mock findings are excluded.
                    </>
                  ) : (
                    <>
                      <strong>Note:</strong> Exports NEVER include regulatory history findings.
                      All exported findings are marked as practice inspection findings.
                    </>
                  )}
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
                mode={statusData.mode}
                reportSource={statusData.reportSource}
                snapshotId={statusData.snapshotId}
                ingestionStatus={statusData.ingestionStatus}
              />
            )}
          />
        </main>
      </div>
    </SimulationFrame>
  );
}
