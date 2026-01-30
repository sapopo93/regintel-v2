/**
 * Canonical Evidence Type Enum
 *
 * Single source of truth for all evidence types in RegIntel v2.
 * Used by UI, API, domain logic, exports, and test fixtures.
 *
 * CRITICAL: All evidence classification MUST use this enum.
 * Do NOT use free-text strings for evidence types.
 */

export enum EvidenceType {
  // Regulatory Reports
  CQC_REPORT = 'CQC_REPORT',

  // Core Compliance Documents
  POLICY = 'POLICY',
  TRAINING = 'TRAINING',
  AUDIT = 'AUDIT',

  // Staffing Evidence
  ROTA = 'ROTA',
  SKILLS_MATRIX = 'SKILLS_MATRIX',
  SUPERVISION = 'SUPERVISION',

  // Certifications
  CERTIFICATE = 'CERTIFICATE',

  // Catch-all
  OTHER = 'OTHER',
}

/**
 * Human-readable labels for UI display
 */
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  [EvidenceType.CQC_REPORT]: 'CQC Inspection Report',
  [EvidenceType.POLICY]: 'Policy Document',
  [EvidenceType.TRAINING]: 'Training Record',
  [EvidenceType.AUDIT]: 'Audit Report',
  [EvidenceType.ROTA]: 'Staff Rota',
  [EvidenceType.SKILLS_MATRIX]: 'Skills Matrix',
  [EvidenceType.SUPERVISION]: 'Supervision Records',
  [EvidenceType.CERTIFICATE]: 'Certificate',
  [EvidenceType.OTHER]: 'Other',
};

/**
 * Validate if a string is a valid evidence type
 */
export function isValidEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === 'string' && Object.values(EvidenceType).includes(value as EvidenceType);
}

/**
 * Convert a legacy string to EvidenceType (migration helper)
 * Maps old inconsistent values to new canonical enum.
 */
export function normalizeLegacyEvidenceType(legacyType: string): EvidenceType {
  const normalized = legacyType.toUpperCase().trim();

  // Handle old UI values
  if (normalized === 'POLICY_DOCUMENT' || normalized === 'POLICY') return EvidenceType.POLICY;
  if (normalized === 'TRAINING_RECORD' || normalized === 'TRAINING') return EvidenceType.TRAINING;
  if (normalized === 'AUDIT_REPORT' || normalized === 'AUDIT') return EvidenceType.AUDIT;
  if (normalized === 'STAFF_ROTA' || normalized === 'ROTA') return EvidenceType.ROTA;
  if (normalized === 'SKILLS_MATRIX' || normalized === 'SKILLS MATRIX') return EvidenceType.SKILLS_MATRIX;
  if (normalized === 'SUPERVISION_RECORDS' || normalized === 'SUPERVISION') return EvidenceType.SUPERVISION;
  if (normalized === 'CQC_REPORT') return EvidenceType.CQC_REPORT;
  if (normalized === 'CERTIFICATE') return EvidenceType.CERTIFICATE;

  // Default to OTHER
  return EvidenceType.OTHER;
}

/**
 * Get all evidence types required across all topics
 */
export function getAllRequiredEvidenceTypes(): EvidenceType[] {
  return [
    EvidenceType.POLICY,
    EvidenceType.TRAINING,
    EvidenceType.AUDIT,
    EvidenceType.ROTA,
    EvidenceType.SKILLS_MATRIX,
    EvidenceType.SUPERVISION,
  ];
}
