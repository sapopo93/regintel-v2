'use client';
export const dynamic = "force-dynamic";


/**
 * Facility Detail Page
 *
 * Constitutional requirements satisfied:
 * - Version: Topic Catalog v1, PRS Logic v1
 * - Hash: Both catalog and logic hashes displayed
 * - Time: Snapshot timestamp
 * - Domain: CQC
 *
 * Facts only - no interpretation:
 * - Facility details
 * - Evidence upload capability
 * - Evidence list
 */

import { useEffect, useRef, useState, FormEvent } from 'react';
import type { Route } from 'next';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { apiClient, getValidatedApiBaseUrl } from '@/lib/api/client';
import type { FacilityDetailResponse, EvidenceListResponse, ScanStatus } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import styles from './page.module.css';

export default function FacilityDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Decode URL-encoded params (colons in tenant:resource IDs get encoded as %3A)
  const facilityId = decodeURIComponent(params.facilityId as string);
  const providerId = searchParams.get('provider') ? decodeURIComponent(searchParams.get('provider')!) : null;
  const cqcSyncing = searchParams.get('cqcSyncing') === 'true';

  const [facilityData, setFacilityData] = useState<FacilityDetailResponse | null>(null);
  const [evidenceData, setEvidenceData] = useState<EvidenceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evidence upload state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [evidenceType, setEvidenceType] = useState('POLICY'); // Default to POLICY (most common)
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadScanStatus, setLastUploadScanStatus] = useState<ScanStatus | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; failures: string[] } | null>(null);

  // CQC report sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (providerId && facilityId) {
      try {
        sessionStorage.setItem(
          'regintel:provider_context',
          JSON.stringify({ providerId, facilityId })
        );
      } catch { /* ignore */ }
    }
  }, [providerId, facilityId]);

  useEffect(() => {
    Promise.all([
      apiClient.getFacility(facilityId),
      apiClient.getFacilityEvidence(facilityId),
    ])
      .then(([facility, evidence]) => {
        validateConstitutionalRequirements(facility, { strict: true });
        validateConstitutionalRequirements(evidence, { strict: true });
        setFacilityData(facility);
        setEvidenceData(evidence);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [facilityId]);

  // Poll evidence list when arriving from onboarding with cqcSyncing=true.
  // The API enqueues the scrape job synchronously but it can take 30-60s.
  // Stop when a CQC_REPORT record appears or after 90s.
  const cqcPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!cqcSyncing) return;

    const startTime = Date.now();
    const TIMEOUT_MS = 90_000;
    const POLL_INTERVAL_MS = 5_000;

    const poll = async () => {
      if (Date.now() - startTime > TIMEOUT_MS) return;
      try {
        const evidence = await apiClient.getFacilityEvidence(facilityId);
        const hasCqcReport = evidence.evidence.some((e) => e.evidenceType === 'CQC_REPORT');
        if (hasCqcReport) {
          setEvidenceData(evidence);
          const base = `/facilities/${encodeURIComponent(facilityId)}`;
          const nextRoute = (
            providerId ? `${base}?provider=${encodeURIComponent(providerId)}` : base
          ) as Route;
          router.replace(nextRoute);
          return;
        }
      } catch { /* ignore polling errors */ }
      cqcPollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    cqcPollingRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (cqcPollingRef.current) clearTimeout(cqcPollingRef.current);
    };
  }, [cqcSyncing, facilityId, providerId, router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setSelectedFiles(Array.from(files));
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadSingleFile = async (file: File): Promise<void> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    const mimeType = file.type || 'application/pdf';
    const blobResponse = await apiClient.createEvidenceBlob({
      contentBase64: base64,
      mimeType,
    });

    setLastUploadScanStatus(blobResponse.scanStatus);

    await apiClient.createFacilityEvidence({
      facilityId,
      blobHash: blobResponse.blobHash,
      evidenceType,
      fileName: file.name,
      description: description.trim() || undefined,
    });
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (selectedFiles.length === 0) {
      setUploadError('Please select at least one file');
      return;
    }

    setUploading(true);
    const failures: string[] = [];
    setUploadProgress({ completed: 0, total: selectedFiles.length, failures: [] });

    for (let i = 0; i < selectedFiles.length; i++) {
      try {
        await uploadSingleFile(selectedFiles[i]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        failures.push(`${selectedFiles[i].name}: ${msg}`);
      }
      setUploadProgress({ completed: i + 1, total: selectedFiles.length, failures: [...failures] });
    }

    // Reload evidence list
    try {
      const evidence = await apiClient.getFacilityEvidence(facilityId);
      setEvidenceData(evidence);
    } catch { /* ignore reload failure */ }

    if (failures.length > 0) {
      setUploadError(`${failures.length} file(s) failed:\n${failures.join('\n')}`);
    } else {
      // All succeeded — reset form
      setShowUploadForm(false);
      setDescription('');
      setEvidenceType('POLICY');
    }

    setSelectedFiles([]);
    setUploadProgress(null);
    setUploading(false);
  };

  const handleSyncReport = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const response = await apiClient.syncLatestReport(facilityId);
      setSyncMessage(response.message);
    } catch (err: unknown) {
      setSyncMessage(err instanceof Error ? err.message : 'Failed to sync report');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteEvidence = async (evidenceRecordId: string, fileName: string) => {
    if (!confirm(`Remove "${fileName}" from the evidence list? This cannot be undone.`)) {
      return;
    }
    try {
      await apiClient.deleteEvidence(facilityId, evidenceRecordId);
      const evidence = await apiClient.getFacilityEvidence(facilityId);
      setEvidenceData(evidence);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove evidence');
    }
  };

  const handleDownloadEvidence = async (blobHash: string, fileName: string) => {
    try {
      const baseUrl = getValidatedApiBaseUrl();
      const response = await fetch(`${baseUrl}/v1/evidence/blobs/${blobHash}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download file');
    }
  };

  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.loading}>Loading location...</div>
      </div>
    );
  }

  if (error || !facilityData || !evidenceData) {
    return (
      <div className={styles.layout}>
        <div className={styles.error}>Error: {error || 'Failed to load location'}</div>
      </div>
    );
  }

  const { facility } = facilityData;

  return (
    <div className={styles.layout}>
      <Sidebar
        providerName={facilityData.provider?.providerName || facility.facilityName}
        snapshotDate={facilityData.snapshotTimestamp}
        topicCatalogVersion={facilityData.topicCatalogVersion}
        prsLogicVersion={facilityData.prsLogicVersion}
      />

      <main className={styles.main}>
        <PageHeader
          title={facility.facilityName}
          subtitle={`CQC Location ID: ${facility.cqcLocationId}`}
          topicCatalogVersion={facilityData.topicCatalogVersion}
          topicCatalogHash={facilityData.topicCatalogHash}
          prsLogicVersion={facilityData.prsLogicVersion}
          prsLogicHash={facilityData.prsLogicHash}
          snapshotTimestamp={facilityData.snapshotTimestamp}
          domain={facilityData.domain}
          reportingDomain={facilityData.reportingDomain}
          mode={facilityData.mode}
          reportSource={facilityData.reportSource}
          snapshotId={facilityData.snapshotId}
          ingestionStatus={facilityData.ingestionStatus}
        />

        <MetadataBar
          topicCatalogVersion={facilityData.topicCatalogVersion}
          topicCatalogHash={facilityData.topicCatalogHash}
          prsLogicVersion={facilityData.prsLogicVersion}
          prsLogicHash={facilityData.prsLogicHash}
          snapshotTimestamp={facilityData.snapshotTimestamp}
          domain={facilityData.domain}
          reportingDomain={facilityData.reportingDomain}
          mode={facilityData.mode}
          reportSource={facilityData.reportSource}
          snapshotId={facilityData.snapshotId}
          ingestionStatus={facilityData.ingestionStatus}
        />

        <section className={styles.section}>
          {cqcSyncing && (
            <div className={styles.syncBanner} data-testid="cqc-sync-banner">
              Fetching latest CQC inspection report... this may take 30–60 seconds.
            </div>
          )}

          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Location Details</h2>
            {providerId && (
              <button
                className={styles.overviewButton}
                onClick={() => router.push(`/overview?provider=${providerId}&facility=${facilityId}`)}
                data-testid="continue-overview-button"
              >
                Continue to Overview
              </button>
            )}
          </div>
          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Address:</span>
              <span className={styles.detailValue}>
                {facility.addressLine1}, {facility.townCity}, {facility.postcode}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>CQC Location ID:</span>
              <span className={styles.detailValue}>{facility.cqcLocationId}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Service Type:</span>
              <span className={styles.detailValue}>{facility.serviceType}</span>
            </div>
            {facility.capacity && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Capacity:</span>
                <span className={styles.detailValue}>{facility.capacity}</span>
              </div>
            )}
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>As Of:</span>
              <span className={styles.detailValue}>{facility.asOf}</span>
            </div>
          </div>

          {/* Sync CQC Report Section */}
          <div className={styles.syncSection}>
            <button
              className={styles.syncButton}
              onClick={handleSyncReport}
              disabled={syncing}
              data-testid="sync-report-button"
            >
              {syncing ? 'Syncing...' : 'Sync Latest CQC Report'}
            </button>
            {syncMessage && (
              <span className={styles.syncMessage}>{syncMessage}</span>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Evidence</h2>
            <button
              className={styles.uploadButton}
              onClick={() => setShowUploadForm(!showUploadForm)}
              data-testid="toggle-upload-button"
            >
              {showUploadForm ? 'Cancel Upload' : 'Upload Evidence'}
            </button>
          </div>

          {lastUploadScanStatus && (
            <div className={styles.scanStatusBanner} data-testid="scan-status-banner">
              <span className={styles.scanStatusLabel}>Last Upload Scan Status:</span>
              <span className={`${styles.scanStatusValue} ${styles[`scan${lastUploadScanStatus}`]}`}>
                {lastUploadScanStatus}
              </span>
              {lastUploadScanStatus === 'PENDING' && (
                <span className={styles.scanStatusHint}>Malware scan in progress...</span>
              )}
            </div>
          )}

          {showUploadForm && (
            <form onSubmit={handleUploadSubmit} className={styles.uploadForm}>
              {uploadError && <div className={styles.error}>{uploadError}</div>}

              <div className={styles.formGroup}>
                <label htmlFor="file" className={styles.label}>
                  Files (PDF, Image, Document) — select multiple
                </label>
                <input
                  id="file"
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className={styles.fileInput}
                  disabled={uploading}
                  data-testid="file-input"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                />
                {selectedFiles.length > 0 && (
                  <div className={styles.fileList}>
                    {selectedFiles.map((file, i) => (
                      <div key={`${file.name}-${i}`} className={styles.fileListItem}>
                        <span className={styles.fileName}>{file.name}</span>
                        <button
                          type="button"
                          className={styles.fileRemoveButton}
                          onClick={() => handleRemoveFile(i)}
                          disabled={uploading}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="evidenceType" className={styles.label}>
                  Evidence Type
                </label>
                <select
                  id="evidenceType"
                  value={evidenceType}
                  onChange={(e) => setEvidenceType(e.target.value)}
                  className={styles.select}
                  disabled={uploading}
                  data-testid="evidence-type-select"
                >
                  <option value="CQC_REPORT">CQC Inspection Report</option>
                  <option value="POLICY">Policy Document</option>
                  <option value="TRAINING">Training Record</option>
                  <option value="AUDIT">Audit Report</option>
                  <option value="ROTA">Staff Rota</option>
                  <option value="SKILLS_MATRIX">Skills Matrix</option>
                  <option value="SUPERVISION">Supervision Records</option>
                  <option value="CERTIFICATE">Certificate</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="description" className={styles.label}>
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.textarea}
                  disabled={uploading}
                  data-testid="description-input"
                  rows={3}
                />
              </div>

              {uploadProgress && (
                <div className={styles.uploadProgressBar}>
                  <div className={styles.uploadProgressLabel}>
                    Uploading {uploadProgress.completed}/{uploadProgress.total}...
                  </div>
                  <div className={styles.uploadProgressTrack}>
                    <div
                      className={styles.uploadProgressFill}
                      style={{ width: `${Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                className={styles.submitButton}
                disabled={uploading || selectedFiles.length === 0}
                data-testid="primary-upload-evidence"
              >
                {uploading
                  ? `Uploading (${uploadProgress?.completed ?? 0}/${uploadProgress?.total ?? 0})...`
                  : selectedFiles.length > 1
                    ? `Upload ${selectedFiles.length} Files`
                    : 'Upload'}
              </button>
            </form>
          )}

          <div className={styles.evidenceList}>
            {evidenceData.evidence.length === 0 ? (
              <div className={styles.empty}>No evidence uploaded yet.</div>
            ) : (
              evidenceData.evidence.map((record) => (
                <div key={record.evidenceRecordId} className={styles.evidenceCard}>
                  <div className={styles.evidenceCardHeader}>
                    <h4 className={styles.evidenceTitle}>{record.fileName}</h4>
                    <div className={styles.evidenceActions}>
                      <button
                        className={styles.downloadButton}
                        onClick={() => handleDownloadEvidence(record.blobHash, record.fileName)}
                        data-testid={`download-${record.evidenceRecordId}`}
                      >
                        Download
                      </button>
                      <button
                        className={styles.removeButton}
                        onClick={() => handleDeleteEvidence(record.evidenceRecordId, record.fileName)}
                        data-testid={`remove-${record.evidenceRecordId}`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className={styles.evidenceDetails}>
                    <span className={styles.evidenceDetail}>Type: {record.mimeType}</span>
                    <span className={styles.evidenceDetail}>
                      Uploaded: {new Date(record.uploadedAt).toLocaleDateString()}
                    </span>
                    <span className={styles.evidenceDetail}>Evidence: {record.evidenceType}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
