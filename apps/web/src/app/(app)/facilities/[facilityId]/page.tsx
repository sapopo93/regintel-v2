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

import { useEffect, useState, FormEvent } from 'react';
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [evidenceType, setEvidenceType] = useState('POLICY'); // Default to POLICY (most common)
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadScanStatus, setLastUploadScanStatus] = useState<ScanStatus | null>(null);

  // CQC report sync state
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!selectedFile) {
      setUploadError('Please select a file');
      return;
    }

    setUploading(true);

    try {
      // Read file as base64 using Promise wrapper
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(selectedFile);
      });

      const mimeType = selectedFile.type || 'application/pdf';
      const blobResponse = await apiClient.createEvidenceBlob({
        contentBase64: base64,
        mimeType,
      });

      // Show scan status from blob upload
      setLastUploadScanStatus(blobResponse.scanStatus);

      await apiClient.createFacilityEvidence({
        facilityId,
        blobHash: blobResponse.blobHash,
        evidenceType,
        fileName: selectedFile.name,
        description: description.trim() || undefined,
      });

      // Reload evidence list
      const evidence = await apiClient.getFacilityEvidence(facilityId);
      setEvidenceData(evidence);

      // Reset form
      setShowUploadForm(false);
      setSelectedFile(null);
      setDescription('');
      setEvidenceType('POLICY'); // Reset to default
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload evidence');
    } finally {
      setUploading(false);
    }
  };

  const handleSyncReport = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const response = await apiClient.syncLatestReport(facilityId);
      setSyncMessage(`${response.message} Job ID: ${response.jobId}`);
    } catch (err: unknown) {
      setSyncMessage(err instanceof Error ? err.message : 'Failed to sync report');
    } finally {
      setSyncing(false);
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
              <span className={styles.detailLabel}>Provider ID:</span>
              <span className={styles.detailValueMono}>{facility.providerId}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Facility ID:</span>
              <span className={styles.detailValueMono}>{facility.id}</span>
            </div>
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
              <span className={styles.detailLabel}>Facility Hash:</span>
              <span className={styles.detailValueMono}>{facility.facilityHash}</span>
            </div>
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
                  File (PDF, Image, Document)
                </label>
                <input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  className={styles.fileInput}
                  disabled={uploading}
                  data-testid="file-input"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                />
                {selectedFile && (
                  <span className={styles.fileName}>{selectedFile.name}</span>
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

              <button
                type="submit"
                className={styles.submitButton}
                disabled={uploading || !selectedFile}
                data-testid="primary-upload-evidence"
              >
                {uploading ? 'Uploading...' : 'Upload'}
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
                    <button
                      className={styles.downloadButton}
                      onClick={() => handleDownloadEvidence(record.blobHash, record.fileName)}
                      data-testid={`download-${record.evidenceRecordId}`}
                    >
                      Download
                    </button>
                  </div>
                  <div className={styles.evidenceDetails}>
                    <span className={styles.evidenceDetail}>Type: {record.mimeType}</span>
                    <span className={styles.evidenceDetail}>
                      Uploaded: {new Date(record.uploadedAt).toLocaleDateString()}
                    </span>
                    <span className={styles.evidenceDetail}>Evidence: {record.evidenceType}</span>
                  </div>
                  <div className={styles.evidenceHash}>Hash: {record.blobHash.substring(0, 16)}...</div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
