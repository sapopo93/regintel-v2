'use client';
export const dynamic = "force-dynamic";


/**
 * Evidence Page
 *
 * Displays all evidence records for a provider.
 * Supports uploading new evidence and deleting existing records.
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireProviderAndFacility } from '@/lib/hooks/useRequireContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { DisclosurePanel } from '@/components/disclosure/DisclosurePanel';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { SimulationFrame } from '@/components/mock/SimulationFrame';
import { apiClient } from '@/lib/api/client';
import type { EvidenceListResponse, ProviderOverviewResponse } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { EmptyState } from '@/components/layout/EmptyState';
import { Upload, Trash2, X } from 'lucide-react';
import styles from './page.module.css';

const EVIDENCE_TYPE_GROUPS = [
  {
    label: 'Regulatory Reports',
    options: [
      { value: 'CQC_REPORT', label: 'CQC Inspection Report' },
    ],
  },
  {
    label: 'Core Compliance',
    options: [
      { value: 'POLICY', label: 'Policy Document' },
      { value: 'AUDIT', label: 'Audit Report' },
    ],
  },
  {
    label: 'Clinical Records',
    options: [
      { value: 'CARE_PLAN', label: 'Care Plan' },
      { value: 'MAR_CHART', label: 'MAR Chart' },
      { value: 'RISK_ASSESSMENT', label: 'Risk Assessment' },
      { value: 'INCIDENT_REPORT', label: 'Incident Report' },
      { value: 'DAILY_NOTES', label: 'Daily Notes' },
      { value: 'HANDOVER_NOTES', label: 'Handover Notes' },
      { value: 'MEDICATION_PROTOCOL', label: 'Medication Protocol' },
    ],
  },
  {
    label: 'Staffing',
    options: [
      { value: 'TRAINING', label: 'Training Record' },
      { value: 'ROTA', label: 'Staff Rota' },
      { value: 'SKILLS_MATRIX', label: 'Skills Matrix' },
      { value: 'SUPERVISION', label: 'Supervision Records' },
      { value: 'CERTIFICATE', label: 'Certificate' },
      { value: 'RECRUITMENT_FILE', label: 'Recruitment File (DBS, References)' },
    ],
  },
  {
    label: 'Legal / Safeguarding',
    options: [
      { value: 'DOLS_MCA_ASSESSMENT', label: 'DoLS / MCA Assessment' },
      { value: 'SAFEGUARDING_RECORD', label: 'Safeguarding Record' },
      { value: 'COMPLAINTS_LOG', label: 'Complaints Log' },
    ],
  },
  {
    label: 'Governance',
    options: [
      { value: 'STAFF_MEETING_MINUTES', label: 'Staff Meeting Minutes' },
    ],
  },
  {
    label: 'Safety & Environment',
    options: [
      { value: 'FIRE_SAFETY_CHECK', label: 'Fire Safety / Environmental Check' },
      { value: 'INFECTION_CONTROL_AUDIT', label: 'Infection Control Audit' },
      { value: 'EQUIPMENT_MAINTENANCE_LOG', label: 'Equipment Maintenance Log' },
    ],
  },
  {
    label: 'Clinical Monitoring',
    options: [
      { value: 'NUTRITIONAL_ASSESSMENT', label: 'Nutritional Assessment (MUST)' },
      { value: 'WOUND_CARE_RECORD', label: 'Wound Care Record' },
      { value: 'BODY_MAP', label: 'Body Map' },
      { value: 'FLUID_FOOD_CHART', label: 'Fluid / Food Chart' },
    ],
  },
  {
    label: 'Person-Centred',
    options: [
      { value: 'ACTIVITY_PROGRAMME', label: 'Activity Programme' },
      { value: 'SERVICE_USER_AGREEMENT', label: 'Service User Agreement' },
      { value: 'RESIDENT_SURVEY', label: 'Resident / Family Survey' },
    ],
  },
  {
    label: 'Other',
    options: [
      { value: 'OTHER', label: 'Other' },
    ],
  },
];

export default function EvidencePage() {
  const searchParams = useSearchParams();
  const { providerId, facilityId, ready } = useRequireProviderAndFacility();

  const [overview, setOverview] = useState<ProviderOverviewResponse | null>(null);
  const [data, setData] = useState<EvidenceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState('POLICY');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadData = () => {
    if (!ready || !providerId || !facilityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getProviderOverview(providerId, facilityId),
      apiClient.getEvidence(providerId, facilityId),
    ])
      .then(([overviewResponse, evidenceResponse]) => {
        validateConstitutionalRequirements(evidenceResponse, { strict: true });
        setOverview(overviewResponse);
        setData(evidenceResponse);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [providerId, facilityId, ready]);

  const handleUpload = async () => {
    if (!uploadFile || !facilityId) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data URL prefix (e.g. "data:application/pdf;base64,")
          const base64Part = result.split(',')[1];
          resolve(base64Part);
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      // Step 1: Upload blob
      const blobResponse = await apiClient.createEvidenceBlob({
        contentBase64: base64,
        mimeType: uploadFile.type || 'application/octet-stream',
      });

      // Step 2: Create evidence record
      await apiClient.createFacilityEvidence({
        facilityId,
        blobHash: blobResponse.blobHash,
        evidenceType: uploadType,
        fileName: uploadFile.name,
        description: uploadDescription || undefined,
        expiresAt: uploadExpiry || undefined,
      });

      // Close modal and reload
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadDescription('');
      setUploadExpiry('');
      setUploadType('POLICY');
      loadData();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (evidenceRecordId: string) => {
    if (!facilityId) return;
    setDeletingId(evidenceRecordId);
    try {
      await apiClient.deleteEvidence(facilityId, evidenceRecordId);
      setConfirmDeleteId(null);
      loadData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

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

  const formatBytes = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

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
            title="Evidence Records"
            subtitle={`${data.totalCount} evidence items`}
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

          {(() => {
            const requiredTypes = overview.requiredEvidenceTypes ?? [];
            const uploadedTypes = new Set(data.evidence.map(e => e.evidenceType));
            const missingTypes = requiredTypes.filter(t => !uploadedTypes.has(t));
            return missingTypes.length > 0 ? (
              <div className={styles.missingEvidence}>
                <h3 className={styles.missingTitle}>Missing Evidence Types</h3>
                <ul className={styles.missingList}>
                  {missingTypes.map(t => (
                    <li key={t} className={styles.missingItem}>{t.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          <DisclosurePanel
            summary={(
              <div className={styles.summaryPanel}>
                <div className={styles.summaryRow}>
                  <div>
                    <h2 className={styles.sectionTitle}>Evidence Summary</h2>
                    <p className={styles.summaryText}>
                      {data.totalCount} evidence items are currently registered for this provider.
                    </p>
                  </div>
                  <button
                    className={styles.uploadBtn}
                    onClick={() => setShowUploadModal(true)}
                  >
                    <Upload size={16} />
                    Upload Evidence
                  </button>
                </div>
              </div>
            )}
            evidence={(
              <div className={styles.evidenceList}>
                {data.evidence.length === 0 ? (
                  <EmptyState
                    icon={Upload}
                    title="No evidence records found"
                    description="Upload evidence to demonstrate compliance."
                    action={
                      <button
                        className={styles.uploadBtn}
                        onClick={() => setShowUploadModal(true)}
                      >
                        <Upload size={16} />
                        Upload Evidence
                      </button>
                    }
                  />
                ) : (
                  data.evidence.map((record) => {
                    const audit = record.documentAudit;
                    const expiryInfo = record.expiresAt ? (() => {
                      const daysUntil = Math.ceil((new Date(record.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      return { daysUntil, isOverdue: daysUntil < 0 };
                    })() : null;

                    return (
                      <div key={record.evidenceRecordId} className={styles.evidenceCard}>
                        <div className={styles.evidenceHeader}>
                          <h3 className={styles.evidenceTitle}>{record.fileName}</h3>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {audit?.status === 'COMPLETED' && audit.overallResult && (
                              <span className={`${styles.statusBadge} ${
                                audit.overallResult === 'PASS' ? styles.auditPass :
                                audit.overallResult === 'NEEDS_IMPROVEMENT' ? styles.auditAmber :
                                styles.auditRed
                              }`}>
                                {audit.complianceScore != null ? `${audit.complianceScore}%` : audit.overallResult}
                              </span>
                            )}
                            {audit?.status === 'PENDING' && (
                              <span className={`${styles.statusBadge} ${styles.auditPending}`}>Auditing...</span>
                            )}
                            {expiryInfo && (
                              <span className={`${styles.statusBadge} ${
                                expiryInfo.isOverdue ? styles.auditRed :
                                expiryInfo.daysUntil <= 14 ? styles.auditAmber : ''
                              }`}>
                                {expiryInfo.isOverdue
                                  ? `OVERDUE (${Math.abs(expiryInfo.daysUntil)}d)`
                                  : `Expires ${expiryInfo.daysUntil}d`}
                              </span>
                            )}
                            <div className={styles.statusBadge}>{record.evidenceType}</div>
                          </div>
                        </div>

                        <dl className={styles.evidenceMeta}>
                          <dt>File Type</dt>
                          <dd>{record.mimeType}</dd>

                          <dt>Uploaded At</dt>
                          <dd>{new Date(record.uploadedAt).toLocaleString()}</dd>

                          <dt>File Size</dt>
                          <dd>{formatBytes(record.sizeBytes)}</dd>
                        </dl>

                        {audit?.status === 'COMPLETED' && audit.summary && (
                          <div className={styles.auditSummarySection}>
                            <p className={styles.auditSummaryText}>{audit.summary}</p>
                            <div className={styles.auditFindingCounts}>
                              {(audit.criticalFindings ?? 0) > 0 && (
                                <span className={styles.auditCountCritical}>{audit.criticalFindings} critical</span>
                              )}
                              {(audit.highFindings ?? 0) > 0 && (
                                <span className={styles.auditCountHigh}>{audit.highFindings} high</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className={styles.cardActions}>
                          {confirmDeleteId === record.evidenceRecordId ? (
                            <div className={styles.deleteConfirm}>
                              <span className={styles.deleteConfirmText}>Delete this record?</span>
                              <button
                                className={styles.deleteConfirmBtn}
                                onClick={() => handleDelete(record.evidenceRecordId)}
                                disabled={deletingId === record.evidenceRecordId}
                              >
                                {deletingId === record.evidenceRecordId ? 'Deleting…' : 'Yes, delete'}
                              </button>
                              <button
                                className={styles.cancelBtn}
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className={styles.deleteBtn}
                              onClick={() => setConfirmDeleteId(record.evidenceRecordId)}
                              title="Delete this evidence record"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
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

      {/* Upload Modal */}
      {showUploadModal && (
        <div className={styles.modalOverlay} onClick={() => !uploading && setShowUploadModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Upload Evidence</h2>
              <button
                className={styles.modalClose}
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* File picker */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>File *</label>
                <div
                  className={styles.dropZone}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadFile ? (
                    <span className={styles.dropZoneFile}>{uploadFile.name} ({formatBytes(uploadFile.size)})</span>
                  ) : (
                    <span className={styles.dropZonePlaceholder}>
                      <Upload size={20} />
                      Click to select a file
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.html,.png,.jpg,.jpeg"
                />
              </div>

              {/* Evidence type */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Evidence Type *</label>
                <select
                  className={styles.formSelect}
                  value={uploadType}
                  onChange={e => setUploadType(e.target.value)}
                >
                  {EVIDENCE_TYPE_GROUPS.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description (optional)</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="Brief description of this document"
                  value={uploadDescription}
                  onChange={e => setUploadDescription(e.target.value)}
                />
              </div>

              {/* Expiry date */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Expiry Date (optional)</label>
                <input
                  type="date"
                  className={styles.formInput}
                  value={uploadExpiry}
                  onChange={e => setUploadExpiry(e.target.value)}
                />
              </div>

              {uploadError && (
                <div className={styles.uploadErrorMsg}>{uploadError}</div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className={styles.uploadSubmitBtn}
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SimulationFrame>
  );
}
