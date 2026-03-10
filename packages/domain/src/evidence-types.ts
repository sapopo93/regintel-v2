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

  // Clinical Records
  CARE_PLAN = 'CARE_PLAN',
  MAR_CHART = 'MAR_CHART',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',
  INCIDENT_REPORT = 'INCIDENT_REPORT',
  DAILY_NOTES = 'DAILY_NOTES',
  HANDOVER_NOTES = 'HANDOVER_NOTES',
  MEDICATION_PROTOCOL = 'MEDICATION_PROTOCOL',

  // Staffing Evidence
  ROTA = 'ROTA',
  SKILLS_MATRIX = 'SKILLS_MATRIX',
  SUPERVISION = 'SUPERVISION',

  // Certifications
  CERTIFICATE = 'CERTIFICATE',

  // Legal/Safeguarding
  DOLS_MCA_ASSESSMENT = 'DOLS_MCA_ASSESSMENT',
  SAFEGUARDING_RECORD = 'SAFEGUARDING_RECORD',
  COMPLAINTS_LOG = 'COMPLAINTS_LOG',

  // Governance
  STAFF_MEETING_MINUTES = 'STAFF_MEETING_MINUTES',
  RECRUITMENT_FILE = 'RECRUITMENT_FILE',

  // Safety & Environment
  FIRE_SAFETY_CHECK = 'FIRE_SAFETY_CHECK',
  INFECTION_CONTROL_AUDIT = 'INFECTION_CONTROL_AUDIT',
  EQUIPMENT_MAINTENANCE_LOG = 'EQUIPMENT_MAINTENANCE_LOG',

  // Clinical Monitoring
  NUTRITIONAL_ASSESSMENT = 'NUTRITIONAL_ASSESSMENT',
  WOUND_CARE_RECORD = 'WOUND_CARE_RECORD',
  BODY_MAP = 'BODY_MAP',
  FLUID_FOOD_CHART = 'FLUID_FOOD_CHART',

  // Person-Centred
  ACTIVITY_PROGRAMME = 'ACTIVITY_PROGRAMME',
  SERVICE_USER_AGREEMENT = 'SERVICE_USER_AGREEMENT',
  RESIDENT_SURVEY = 'RESIDENT_SURVEY',

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
  [EvidenceType.CARE_PLAN]: 'Care Plan',
  [EvidenceType.MAR_CHART]: 'MAR Chart',
  [EvidenceType.RISK_ASSESSMENT]: 'Risk Assessment',
  [EvidenceType.INCIDENT_REPORT]: 'Incident Report',
  [EvidenceType.DAILY_NOTES]: 'Daily Notes',
  [EvidenceType.HANDOVER_NOTES]: 'Handover Notes',
  [EvidenceType.MEDICATION_PROTOCOL]: 'Medication Protocol',
  [EvidenceType.ROTA]: 'Staff Rota',
  [EvidenceType.SKILLS_MATRIX]: 'Skills Matrix',
  [EvidenceType.SUPERVISION]: 'Supervision Records',
  [EvidenceType.CERTIFICATE]: 'Certificate',
  [EvidenceType.DOLS_MCA_ASSESSMENT]: 'DoLS / MCA Assessment',
  [EvidenceType.SAFEGUARDING_RECORD]: 'Safeguarding Record',
  [EvidenceType.COMPLAINTS_LOG]: 'Complaints Log',
  [EvidenceType.STAFF_MEETING_MINUTES]: 'Staff Meeting Minutes',
  [EvidenceType.RECRUITMENT_FILE]: 'Recruitment File (DBS, References)',
  [EvidenceType.FIRE_SAFETY_CHECK]: 'Fire Safety / Environmental Check',
  [EvidenceType.INFECTION_CONTROL_AUDIT]: 'Infection Control Audit',
  [EvidenceType.EQUIPMENT_MAINTENANCE_LOG]: 'Equipment Maintenance Log',
  [EvidenceType.NUTRITIONAL_ASSESSMENT]: 'Nutritional Assessment (MUST)',
  [EvidenceType.WOUND_CARE_RECORD]: 'Wound Care Record',
  [EvidenceType.BODY_MAP]: 'Body Map',
  [EvidenceType.FLUID_FOOD_CHART]: 'Fluid / Food Chart',
  [EvidenceType.ACTIVITY_PROGRAMME]: 'Activity Programme',
  [EvidenceType.SERVICE_USER_AGREEMENT]: 'Service User Agreement',
  [EvidenceType.RESIDENT_SURVEY]: 'Resident / Family Survey',
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

  // Clinical records
  if (normalized === 'CARE_PLAN' || normalized === 'CARE PLAN' || normalized === 'CAREPLAN') return EvidenceType.CARE_PLAN;
  if (normalized === 'MAR_CHART' || normalized === 'MAR CHART' || normalized === 'MAR') return EvidenceType.MAR_CHART;
  if (normalized === 'RISK_ASSESSMENT' || normalized === 'RISK ASSESSMENT') return EvidenceType.RISK_ASSESSMENT;
  if (normalized === 'INCIDENT_REPORT' || normalized === 'INCIDENT REPORT' || normalized === 'INCIDENT') return EvidenceType.INCIDENT_REPORT;
  if (normalized === 'DAILY_NOTES' || normalized === 'DAILY NOTES') return EvidenceType.DAILY_NOTES;
  if (normalized === 'HANDOVER_NOTES' || normalized === 'HANDOVER NOTES' || normalized === 'HANDOVER') return EvidenceType.HANDOVER_NOTES;
  if (normalized === 'MEDICATION_PROTOCOL' || normalized === 'MEDICATION PROTOCOL') return EvidenceType.MEDICATION_PROTOCOL;

  // Legal/Safeguarding
  if (normalized === 'DOLS_MCA_ASSESSMENT' || normalized === 'DOLS' || normalized === 'MCA' || normalized === 'MCA_ASSESSMENT') return EvidenceType.DOLS_MCA_ASSESSMENT;
  if (normalized === 'SAFEGUARDING_RECORD' || normalized === 'SAFEGUARDING') return EvidenceType.SAFEGUARDING_RECORD;
  if (normalized === 'COMPLAINTS_LOG' || normalized === 'COMPLAINTS' || normalized === 'COMPLAINT') return EvidenceType.COMPLAINTS_LOG;

  // Governance
  if (normalized === 'STAFF_MEETING_MINUTES' || normalized === 'MEETING_MINUTES' || normalized === 'STAFF MEETING MINUTES') return EvidenceType.STAFF_MEETING_MINUTES;
  if (normalized === 'RECRUITMENT_FILE' || normalized === 'RECRUITMENT' || normalized === 'DBS') return EvidenceType.RECRUITMENT_FILE;

  // Safety & Environment
  if (normalized === 'FIRE_SAFETY_CHECK' || normalized === 'FIRE SAFETY' || normalized === 'FIRE_SAFETY') return EvidenceType.FIRE_SAFETY_CHECK;
  if (normalized === 'INFECTION_CONTROL_AUDIT' || normalized === 'INFECTION CONTROL' || normalized === 'IPC_AUDIT') return EvidenceType.INFECTION_CONTROL_AUDIT;
  if (normalized === 'EQUIPMENT_MAINTENANCE_LOG' || normalized === 'EQUIPMENT MAINTENANCE') return EvidenceType.EQUIPMENT_MAINTENANCE_LOG;

  // Clinical Monitoring
  if (normalized === 'NUTRITIONAL_ASSESSMENT' || normalized === 'MUST' || normalized === 'NUTRITIONAL') return EvidenceType.NUTRITIONAL_ASSESSMENT;
  if (normalized === 'WOUND_CARE_RECORD' || normalized === 'WOUND CARE' || normalized === 'WOUND') return EvidenceType.WOUND_CARE_RECORD;
  if (normalized === 'BODY_MAP' || normalized === 'BODY MAP' || normalized === 'BODYMAP') return EvidenceType.BODY_MAP;
  if (normalized === 'FLUID_FOOD_CHART' || normalized === 'FLUID CHART' || normalized === 'FOOD CHART') return EvidenceType.FLUID_FOOD_CHART;

  // Person-Centred
  if (normalized === 'ACTIVITY_PROGRAMME' || normalized === 'ACTIVITY PROGRAMME' || normalized === 'ACTIVITIES') return EvidenceType.ACTIVITY_PROGRAMME;
  if (normalized === 'SERVICE_USER_AGREEMENT' || normalized === 'SERVICE USER AGREEMENT') return EvidenceType.SERVICE_USER_AGREEMENT;
  if (normalized === 'RESIDENT_SURVEY' || normalized === 'RESIDENT SURVEY' || normalized === 'FAMILY_SURVEY') return EvidenceType.RESIDENT_SURVEY;

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
