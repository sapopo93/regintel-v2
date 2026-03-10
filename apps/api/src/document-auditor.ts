import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { join } from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { EvidenceType } from '@regintel/domain/evidence-types';

export interface SAFStatementResult {
  statementId: string;
  statementName: string;
  rating: 'MET' | 'PARTIALLY_MET' | 'NOT_MET' | 'NOT_APPLICABLE';
  evidence: string;
}

export interface AuditFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  description: string;
  regulatoryReference?: string;
  regulation?: string;
  safStatement?: string;
}

export interface AuditCorrection {
  finding: string;
  correction: string;
  policyReference: string;
  priority: 'IMMEDIATE' | 'THIS_WEEK' | 'THIS_MONTH';
  exampleWording?: string;
}

export interface DocumentAuditResult {
  documentType: string;
  auditDate: string;
  overallResult: 'PASS' | 'NEEDS_IMPROVEMENT' | 'CRITICAL_GAPS';
  complianceScore: number;
  safStatements: SAFStatementResult[];
  findings: AuditFinding[];
  corrections: AuditCorrection[];
  summary: string;
}

export type DocumentAuditStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface DocumentAuditSummary {
  status: DocumentAuditStatus;
  evidenceRecordId: string;
  documentType?: string;
  originalFileName?: string;
  overallResult?: DocumentAuditResult['overallResult'];
  complianceScore?: number;
  criticalFindings?: number;
  highFindings?: number;
  summary?: string;
  auditedAt?: string;
  failureReason?: string;
  result?: DocumentAuditResult;
}

interface StoredDocumentAudit extends DocumentAuditSummary {
  facilityId: string;
  providerId: string;
}

const OVERALL_RESULTS = new Set<DocumentAuditResult['overallResult']>([
  'PASS',
  'NEEDS_IMPROVEMENT',
  'CRITICAL_GAPS',
]);
const DOCUMENT_AUDIT_STATUSES = new Set<DocumentAuditStatus>([
  'PENDING',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
]);
const FINDING_SEVERITIES = new Set<AuditFinding['severity']>([
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
]);
const CORRECTION_PRIORITIES = new Set<AuditCorrection['priority']>([
  'IMMEDIATE',
  'THIS_WEEK',
  'THIS_MONTH',
]);
const STATEMENT_RATINGS = new Set<SAFStatementResult['rating']>([
  'MET',
  'PARTIALLY_MET',
  'NOT_MET',
  'NOT_APPLICABLE',
]);
const DOCUMENT_TYPE_BY_EVIDENCE_TYPE: Record<string, string> = {
  [EvidenceType.CQC_REPORT]: 'CQC_REPORT',
  [EvidenceType.POLICY]: 'POLICY_DOCUMENT',
  [EvidenceType.TRAINING]: 'TRAINING_MATRIX',
  [EvidenceType.AUDIT]: 'AUDIT_REPORT',
  [EvidenceType.CARE_PLAN]: 'CARE_PLAN',
  [EvidenceType.MAR_CHART]: 'MAR_CHART',
  [EvidenceType.RISK_ASSESSMENT]: 'RISK_ASSESSMENT',
  [EvidenceType.INCIDENT_REPORT]: 'INCIDENT_REPORT',
  [EvidenceType.DAILY_NOTES]: 'DAILY_NOTES',
  [EvidenceType.HANDOVER_NOTES]: 'HANDOVER_NOTES',
  [EvidenceType.MEDICATION_PROTOCOL]: 'MEDICATION_PROTOCOL',
  [EvidenceType.ROTA]: 'SIGN_IN_OUT',
  [EvidenceType.SKILLS_MATRIX]: 'TRAINING_MATRIX',
  [EvidenceType.SUPERVISION]: 'SUPERVISION_RECORD',
  [EvidenceType.CERTIFICATE]: 'CERTIFICATE',
  [EvidenceType.DOLS_MCA_ASSESSMENT]: 'DOLS_MCA_ASSESSMENT',
  [EvidenceType.SAFEGUARDING_RECORD]: 'SAFEGUARDING_RECORD',
  [EvidenceType.COMPLAINTS_LOG]: 'COMPLAINTS_LOG',
  [EvidenceType.STAFF_MEETING_MINUTES]: 'STAFF_MEETING_MINUTES',
  [EvidenceType.RECRUITMENT_FILE]: 'RECRUITMENT_FILE',
  [EvidenceType.FIRE_SAFETY_CHECK]: 'FIRE_SAFETY_CHECK',
  [EvidenceType.INFECTION_CONTROL_AUDIT]: 'INFECTION_CONTROL_AUDIT',
  [EvidenceType.EQUIPMENT_MAINTENANCE_LOG]: 'EQUIPMENT_MAINTENANCE_LOG',
  [EvidenceType.NUTRITIONAL_ASSESSMENT]: 'NUTRITIONAL_ASSESSMENT',
  [EvidenceType.WOUND_CARE_RECORD]: 'WOUND_CARE_RECORD',
  [EvidenceType.BODY_MAP]: 'BODY_MAP',
  [EvidenceType.FLUID_FOOD_CHART]: 'FLUID_FOOD_CHART',
  [EvidenceType.ACTIVITY_PROGRAMME]: 'ACTIVITY_PROGRAMME',
  [EvidenceType.SERVICE_USER_AGREEMENT]: 'SERVICE_USER_AGREEMENT',
  [EvidenceType.RESIDENT_SURVEY]: 'RESIDENT_SURVEY',
  [EvidenceType.OTHER]: 'OTHER',
};

let anthropicClient: Anthropic | null = null;
let pgPoolPromise: Promise<any> | null = null;

class DocumentAuditExecutionError extends Error {
  readonly status: Exclude<DocumentAuditStatus, 'PENDING' | 'COMPLETED'>;

  constructor(
    status: Exclude<DocumentAuditStatus, 'PENDING' | 'COMPLETED'>,
    message: string
  ) {
    super(message);
    this.name = 'DocumentAuditExecutionError';
    this.status = status;
  }
}

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (!anthropicClient) {
    // 90-second timeout per request — prevents indefinite hangs on large PDFs
    // maxRetries: 1 (SDK default is 2) → worst-case 180s instead of 10 min default
    anthropicClient = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  }

  return anthropicClient;
}

async function getPgPool(): Promise<any | null> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return null;
  }

  if (!pgPoolPromise) {
    pgPoolPromise = import('pg').then(({ Pool }) => new Pool({ connectionString }));
  }

  return pgPoolPromise;
}

const SYSTEM_PROMPT = `You are a CQC regulatory compliance auditor for adult social care in England.
You audit documents against the Care Quality Commission's Single Assessment Framework (SAF).

Key principles:
- Evaluate against the 34 Quality Statements (S1-S9 Safe, E1-E9 Effective, C1-C4 Caring, R1-R4 Responsive, W1-W8 Well-Led)
- Score each relevant Quality Statement as MET, PARTIALLY_MET, NOT_MET, or NOT_APPLICABLE
- Use correct SAF statement IDs (e.g., S8 Medicines optimisation, E6 Consent, E7 MCA/DoLS, W4 Governance)
- Governance failures (W1-W8) are root causes — flag them when clinical issues suggest systemic weakness
- Generic or template-based documentation not personalised to the individual is a finding (minimum MEDIUM)
- Missing signatures, dates, or review periods are findings — cite the specific regulation breached
- Mental Capacity Act compliance requires documented capacity assessments for specific decisions at specific times
- Restrictive practices (bed rails, locked doors, covert medication) require documented best-interest decisions
- Distinguish individual staff competency gaps from systemic organisational failures
- Cite the specific Health and Social Care Act 2008 regulation breached (Reg 9-20)

Severity calibration:
- CRITICAL: Immediate risk to life/safety, unlawful restriction of liberty without DoLS, active abuse/neglect indicators, medication errors causing or risking harm
- HIGH: Missing MCA assessments for capacity-lacking individuals, no review dates on care plans >1 month old, unresolved safeguarding concerns, staffing below safe levels
- MEDIUM: Generic template documentation not personalised, missing signatures on completed records, incomplete risk assessments, policies past review date
- LOW: Minor formatting issues, best-practice recommendations, meets minimum but could improve

Where possible, include exampleWording in corrections showing the provider what corrected text could look like.

Respond with JSON only. No markdown, no commentary outside the JSON object.`;

const AUDIT_PROMPTS: Record<string, string> = {
  MAR_CHART: `Audit this MAR (Medication Administration Record) chart against SAF Quality Statements:
- S8 (Medicines optimisation): Are all doses recorded with time, route, and staff initials? Are PRN medications documented with reason and outcome? Are controlled drugs double-signed?
- S1 (Learning culture): Are medication errors or near-misses documented with learning actions?
- S9 (Short-term risks): Is there evidence of allergy documentation and escalation protocols?

Check for: patient name, date of birth, allergy status, prescriber details, dose/route/frequency for each medicine, administration times with signatures, PRN reason and outcome, controlled drug double signatures, gaps in administration with explanation, review dates.

Flag as CRITICAL: Gaps in controlled drug administration without explanation; missing allergy documentation.
Flag as HIGH: PRN medication given without documented reason; doses missed without escalation.

Return JSON: {"documentType":"MAR_CHART","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"S8","statementName":"Medicines optimisation","rating":"MET|PARTIALLY_MET|NOT_MET|NOT_APPLICABLE","evidence":"..."}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"...","description":"...","regulation":"Reg 12","safStatement":"S8"}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH","exampleWording":"..."}],"summary":"..."}`,

  CARE_PLAN: `Audit this care plan against SAF Quality Statements:
- E1 (Assessing needs): Are needs comprehensively assessed with measurable outcomes?
- R1 (Person-centred care): Is the plan personalised to the individual, not a generic template?
- C2 (Treating people as individuals): Does it reflect preferences, cultural needs, and communication style?
- E6 (Consent to care and treatment): Is consent documented? Is the person's involvement in planning recorded?
- E7 (MCA and DoLS): If the person lacks capacity for specific decisions, is a capacity assessment referenced?

Check for: named individual, personalised goals, review date within last month, risk assessments referenced, consent documentation, cultural/religious preferences, communication needs, named keyworker, involvement of person/family in planning, measurable outcomes.

Flag as CRITICAL: No review for >3 months; restrictive interventions without best-interest decision.
Flag as HIGH: Generic template not personalised; no capacity assessment referenced for person lacking capacity; no consent record.
Flag as MEDIUM: Missing review date; no cultural/communication preferences recorded.

Return JSON: {"documentType":"CARE_PLAN","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"MET|PARTIALLY_MET|NOT_MET|NOT_APPLICABLE","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"...","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  RISK_ASSESSMENT: `Audit this risk assessment against SAF Quality Statements:
- S4 (Involving people to manage risks): Is the person involved in the risk assessment? Are positive risk-taking decisions documented?
- S1 (Learning culture): Are previous incidents referenced to inform the assessment?
- E1 (Assessing needs): Are all relevant risks identified based on assessed needs?

Check for: named individual, specific hazards identified, risk scoring (likelihood x impact), control measures, person's involvement documented, review date, assessor signature, date of assessment, link to care plan, escalation triggers.

Flag as HIGH: No person involvement documented; risk assessment >3 months without review; hazards identified but no control measures.
Flag as MEDIUM: Missing signature or date; no link to care plan; scoring incomplete.

Return JSON: {"documentType":"RISK_ASSESSMENT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 12","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  INCIDENT_REPORT: `Audit this incident report against SAF Quality Statements:
- S1 (Learning culture): Is learning from the incident captured and shared? Are actions to prevent recurrence documented?
- W4 (Governance): Was the registered manager notified? Is there evidence of management oversight?
- W6 (Learning, improvement and innovation): Is there a link to wider quality improvement?
- S3 (Safeguarding): If the incident involves potential abuse or neglect, was a safeguarding referral made?

Check for: date/time of incident, location, persons involved, factual description, immediate actions taken, notifications (manager, family, CQC if notifiable under Reg 18), body of the investigation, root cause, actions to prevent recurrence, follow-up review date, duty of candour compliance.

Flag as CRITICAL: Notifiable incident without CQC notification; safeguarding concern not referred.
Flag as HIGH: No root cause analysis; no actions to prevent recurrence; no management sign-off.
Flag as MEDIUM: Missing follow-up date; incomplete witness statements.

Return JSON: {"documentType":"INCIDENT_REPORT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 20","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  AUDIT_REPORT: `Audit this internal audit report against SAF Quality Statements:
- W4 (Governance, management and sustainability): Does the audit demonstrate effective governance? Are findings actioned with named owners?
- W6 (Learning, improvement and innovation): Does the audit drive improvement? Are trends analysed?
- E5 (Monitoring and improving outcomes): Are outcomes measured and benchmarked?

Check for: audit scope and methodology, sample size, findings with severity, action plan with named owners and target dates, evidence of previous audit follow-up, trend analysis, compliance percentages, escalation of critical findings, sign-off by responsible person.

Flag as HIGH: No action plan for identified non-compliance; no evidence of follow-up from previous audit.
Flag as MEDIUM: Missing target dates or named owners; no trend analysis.

Return JSON: {"documentType":"AUDIT_REPORT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 17","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  DAILY_NOTES: `Audit these daily notes / progress notes against SAF Quality Statements:
- R1 (Person-centred care): Are notes personalised and person-centred, or generic and task-focused?
- C1 (Kindness, compassion and dignity): Do notes reflect dignified, compassionate care?
- C4 (Responding to immediate needs): Are changes in condition or mood noted and acted upon?

Check for: date and time of each entry, staff name/signature, person-centred language (not task lists), observations of mood/wellbeing/engagement, food and fluid intake if relevant, personal care recorded with dignity, escalation of concerns, evidence of wishes being followed.

Flag as HIGH: Notes read as task checklists with no person-centred content; no entries for >24 hours.
Flag as MEDIUM: Missing timestamps or signatures; generic language across multiple residents.

Return JSON: {"documentType":"DAILY_NOTES","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 17","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  HANDOVER_NOTES: `Audit these handover notes against SAF Quality Statements:
- S2 (Safe systems, pathways and transitions): Are all residents covered with key information for safe transition between shifts?
- S8 (Medicines optimisation): Are medication changes highlighted?
- E3 (How staff, teams and services work together): Is there evidence of effective team communication?

Check for: all residents listed, key priorities per resident, medication changes, outstanding tasks, safeguarding alerts, appointments or visits due, new admissions/discharges, staff allocation, escalation items, dated and signed.

Flag as HIGH: Residents omitted from handover; medication changes not highlighted; safeguarding concerns not flagged.
Flag as MEDIUM: Missing signature; incomplete task handover.

Return JSON: {"documentType":"HANDOVER_NOTES","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 12","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  SIGN_IN_OUT: `Audit this rota or sign-in/out record against SAF Quality Statements:
- S6 (Safe and effective staffing): Are staffing levels safe? Are gaps covered? Are qualifications appropriate?
- E3 (How staff, teams and services work together): Is there evidence of team coordination and handover accountability?

Check for: date range, all shifts covered, staff names and roles, start/end times, gaps or uncovered shifts, agency staff identified, skills mix (qualified nurses, senior carers), break coverage, night staffing levels, signatures.

Flag as HIGH: Shifts with no staff allocated; staffing below safe minimum; no qualified nurse on shift when required.
Flag as MEDIUM: Missing signatures; agency staff without induction noted.

Return JSON: {"documentType":"SIGN_IN_OUT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 18","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  SUPERVISION_RECORD: `Audit this supervision record against SAF Quality Statements:
- E8 (Workforce wellbeing and enablement): Is staff wellbeing discussed? Are development needs identified and supported?
- S6 (Safe and effective staffing): Are competency concerns addressed? Is safeguarding discussed?
- W3 (Freedom to speak up): Is there evidence the staff member could raise concerns safely?

Check for: date, supervisee and supervisor names, frequency (at least 6-weekly), topics discussed (practice, wellbeing, training needs, safeguarding awareness), agreed actions with target dates, signatures, follow-up from previous supervision, confidential space for raising concerns.

Flag as HIGH: No supervision for >3 months; safeguarding not discussed; performance concerns not actioned.
Flag as MEDIUM: Missing signatures; no follow-up from previous session; no development plan.

Return JSON: {"documentType":"SUPERVISION_RECORD","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 18","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  TRAINING_MATRIX: `Audit this training matrix against SAF Quality Statements:
- S6 (Safe and effective staffing): Are all mandatory training requirements met? Are expired certifications flagged?
- E8 (Workforce wellbeing and enablement): Are staff supported with ongoing learning and development?
- W6 (Learning, improvement and innovation): Is there evidence of continuous professional development beyond mandatory training?

Check for: all staff listed, mandatory courses (safeguarding, moving and handling, fire safety, first aid, infection control, MCA/DoLS, medication), completion dates and expiry dates, overall compliance percentage, escalation for overdue training, role-specific training (e.g., nursing competencies), induction records for new staff.

Flag as HIGH: Mandatory training compliance <80%; safeguarding or medication training expired for >1 month; new staff without completed induction.
Flag as MEDIUM: Individual courses expired but within 1-month grace; no role-specific training tracked.

Return JSON: {"documentType":"TRAINING_MATRIX","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 18","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  MEDICATION_PROTOCOL: `Audit this medication protocol/policy against SAF Quality Statements:
- S8 (Medicines optimisation): Does the protocol cover safe handling, storage, administration, and disposal?
- S1 (Learning culture): Is there a process for reporting and learning from medication errors?
- W4 (Governance): Is the protocol version-controlled, approved, and reviewed?

Check for: version number, author, approval date, review date, scope (which staff, which medications), storage requirements (temperature monitoring, controlled drugs), administration procedures, competency requirements, error reporting process, covert medication policy, disposal procedures, audit trail requirements.

Flag as HIGH: Protocol past review date by >6 months; no controlled drugs procedure; no error reporting process.
Flag as MEDIUM: Missing version control; no named author; no competency requirements specified.

Return JSON: {"documentType":"MEDICATION_PROTOCOL","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 12","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  POLICY_DOCUMENT: `Audit this policy or procedure document against SAF Quality Statements:
- W4 (Governance, management and sustainability): Is the policy properly governed with version control, named author, and review schedule?
- W1 (Shared direction and culture): Does the policy reflect organisational values and regulatory requirements?
- W6 (Learning, improvement and innovation): Has the policy been updated based on incidents, complaints, or regulatory changes?

Check for: document title, version number, named author, approval signature, issue date, review date, scope and purpose, regulatory references (which HSCA 2008 regulations it addresses), roles and responsibilities, operational procedures, monitoring and audit arrangements, related documents.

Flag as HIGH: No review date or past review date by >12 months; no regulatory references; no version control.
Flag as MEDIUM: Missing author or approval signature; no monitoring arrangements described.

Return JSON: {"documentType":"POLICY_DOCUMENT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 17","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  CQC_REPORT: `Review this CQC inspection report to identify compliance themes and action priorities against SAF Quality Statements. Map each finding to the relevant QS (S1-S9, E1-E9, C1-C4, R1-R4, W1-W8). Identify recurring themes, areas rated Requires Improvement or Inadequate, and any enforcement actions or conditions.

Return JSON: {"documentType":"CQC_REPORT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"...","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  CERTIFICATE: `Review this certificate against SAF Quality Statements:
- S6 (Safe and effective staffing): Is the certificate current and valid?
- E8 (Workforce wellbeing and enablement): Does it demonstrate relevant competency?

Check for: certificate holder name, issuing body, qualification/course title, date of issue, expiry date (if applicable), scope of competency, accreditation status of issuing body.

Flag as HIGH: Certificate expired; issuing body not recognised; no named holder.
Flag as MEDIUM: No expiry date shown; scope unclear.

Return JSON: {"documentType":"CERTIFICATE","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"...","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  DOLS_MCA_ASSESSMENT: `Audit this Mental Capacity Act / Deprivation of Liberty Safeguards assessment against SAF Quality Statements:
- E6 (Consent to care and treatment): Is consent sought in line with Mental Capacity Act 2005?
- E7 (MCA and DoLS): Is there a decision-specific capacity assessment? Is the two-stage test documented? Are best-interest decisions recorded with consultee involvement? Is the DoLS application tracked with authorisation dates and conditions?

Check for: named individual, specific decision assessed, dated two-stage test (diagnostic + functional), best-interest checklist, named consultee, DoLS authorisation reference, expiry tracking, conditions attached, review schedule.

Flag as CRITICAL: No capacity assessment for a person subject to restrictions; DoLS expired without renewal.
Flag as HIGH: Generic assessment not decision-specific; no consultee involvement in best-interest decision.

Return JSON: {"documentType":"DOLS_MCA_ASSESSMENT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 11","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  SAFEGUARDING_RECORD: `Audit this safeguarding record against SAF Quality Statements:
- S3 (Safeguarding): Is the concern clearly described? Was a referral made to the local authority? Is the outcome recorded?
- S1 (Learning culture): Was learning from the incident captured and shared?
- W4 (Governance): Was the registered manager notified? Was a CQC notification submitted if required under Reg 18?

Check for: date/time of concern, description of what happened, who raised it, body map if applicable, referral to local authority safeguarding team, CQC notification reference, outcome, actions taken, lessons learned, follow-up review date.

Flag as CRITICAL: Safeguarding concern not referred to local authority; no action taken on allegation of abuse.
Flag as HIGH: CQC notification not submitted for notifiable event; no body map for unexplained injury.

Return JSON: {"documentType":"SAFEGUARDING_RECORD","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 13","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  COMPLAINTS_LOG: `Audit this complaints log against SAF Quality Statements:
- R4 (Listening to and involving people): Are complaints investigated and responded to within policy timeframes?
- W4 (Governance): Is there management oversight of complaint patterns?
- W6 (Learning, improvement and innovation): Are lessons learned documented and acted upon?

Check for: date received, complainant details, nature of complaint, date acknowledged, investigation summary, outcome/resolution, response date (within 20 working days), satisfaction follow-up, lessons learned, pattern analysis, escalation to ombudsman if unresolved.

Flag as HIGH: Complaints not responded to within policy timeframe; recurring complaint themes without action plan.
Flag as MEDIUM: No lessons learned documented; no pattern analysis.

Return JSON: {"documentType":"COMPLAINTS_LOG","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 16","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  STAFF_MEETING_MINUTES: `Audit these staff meeting minutes against SAF Quality Statements:
- W1 (Shared direction and culture): Is there evidence of leadership communicating vision and priorities?
- W3 (Freedom to speak up): Is there evidence that staff can raise concerns in meetings?
- W6 (Learning, improvement and innovation): Are learning points from incidents, complaints, or audits shared?

Check for: date, attendees, apologies, agenda items, discussion of incidents/complaints/safeguarding, actions from previous meeting, new actions with owners and deadlines, staff concerns raised, training updates, regulatory updates.

Flag as HIGH: No meetings held for >3 months; safeguarding/incidents not discussed.
Flag as MEDIUM: No actions recorded; no follow-up from previous meeting; poor attendance without follow-up.

Return JSON: {"documentType":"STAFF_MEETING_MINUTES","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 17","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  RECRUITMENT_FILE: `Audit this recruitment file against SAF Quality Statements:
- S6 (Safe and effective staffing): Does the file demonstrate fit and proper persons checks (Reg 19)?

Check for: application form, two references (one from most recent employer), DBS check (enhanced with barred list for care), proof of identity, right to work, health declaration, interview notes, qualifications verified, employment history gaps explained, Reg 19 declaration.

Flag as CRITICAL: No DBS check or DBS check expired; employed without references.
Flag as HIGH: Only one reference; gaps in employment history unexplained; no right to work evidence.
Flag as MEDIUM: Missing health declaration; interview notes incomplete.

Return JSON: {"documentType":"RECRUITMENT_FILE","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 19","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  FIRE_SAFETY_CHECK: `Audit this fire safety or environmental check against SAF Quality Statements:
- S5 (Safe environments): Is the environment safe, well-maintained, and suitable?

Check for: date of check, areas inspected, fire alarm test records, fire drill records (frequency, evacuation times), fire extinguisher service dates, emergency lighting test, fire risk assessment reference, PEEPs (Personal Emergency Evacuation Plans) in place, ligature risk assessment if applicable, environmental risk items, named fire safety lead, action plan for deficiencies.

Flag as HIGH: Fire alarm not tested weekly; no fire drill in >6 months; fire extinguishers out of service.
Flag as MEDIUM: Missing PEEPs; environmental checks incomplete.

Return JSON: {"documentType":"FIRE_SAFETY_CHECK","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 15","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  INFECTION_CONTROL_AUDIT: `Audit this infection prevention and control record against SAF Quality Statements:
- S7 (Infection prevention and control): Are IPC standards maintained? Are audits scheduled and completed?
- S5 (Safe environments): Is the environment clean and decontaminated?

Check for: audit date, areas assessed, scoring/compliance %, hand hygiene compliance, PPE availability, laundry separation, clinical waste disposal, outbreak management plan reference, action plan for non-compliance, named IPC lead, frequency of audit cycle.

Flag as HIGH: No IPC audit completed in the last quarter; hand hygiene compliance below 90%.
Flag as MEDIUM: Missing action plan for identified non-compliance; no named IPC lead.

Return JSON: {"documentType":"INFECTION_CONTROL_AUDIT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 12","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  EQUIPMENT_MAINTENANCE_LOG: `Audit this equipment maintenance log against SAF Quality Statements:
- S5 (Safe environments): Is equipment properly maintained and serviced?

Check for: equipment inventory, service dates, next service due, LOLER records (for hoists/lifting equipment), PAT testing, bed rail safety checks, wheelchair servicing, named maintenance coordinator, fault reporting process, action on identified defects.

Flag as HIGH: Equipment overdue for service by >1 month; hoists without current LOLER certification.
Flag as MEDIUM: Incomplete records; no fault reporting process documented.

Return JSON: {"documentType":"EQUIPMENT_MAINTENANCE_LOG","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 15","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  NUTRITIONAL_ASSESSMENT: `Audit this nutritional assessment (MUST or equivalent) against SAF Quality Statements:
- E2 (Delivering evidence-based care): Is a validated screening tool used (MUST, MNA)?
- E4 (Supporting people to live healthier lives): Are dietary needs addressed with a clear plan?

Check for: named individual, validated screening tool (MUST score), BMI/weight, weight change history, appetite assessment, dietary requirements, food and fluid plan, referral to dietitian if high risk, review date, staff signature.

Flag as HIGH: High-risk MUST score without dietitian referral; no nutritional assessment for new admission >48 hours.
Flag as MEDIUM: No review date; screening tool not validated; incomplete assessment.

Return JSON: {"documentType":"NUTRITIONAL_ASSESSMENT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 14","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  WOUND_CARE_RECORD: `Audit this wound care record against SAF Quality Statements:
- E2 (Delivering evidence-based care): Is wound care evidence-based with validated assessment tools?
- E5 (Monitoring and improving outcomes): Are outcomes tracked with measurements and photographs?

Check for: wound location and type, wound assessment tool (e.g., PUSH, TIME), measurements (length x width x depth), wound bed description, exudate, surrounding skin, dressing used, frequency of dressing change, pain assessment, referral to tissue viability nurse if not healing, photographs, review dates.

Flag as HIGH: Wound deteriorating without escalation; no wound assessment tool used; pressure ulcer without prevention plan.
Flag as MEDIUM: Missing measurements; no photographs for tracking; incomplete assessment.

Return JSON: {"documentType":"WOUND_CARE_RECORD","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 12","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  BODY_MAP: `Audit this body map against SAF Quality Statements:
- S3 (Safeguarding): Are marks, bruises, or injuries accurately documented for safeguarding purposes?

Check for: named individual, date and time, staff completing the map, clear marking of location/size/colour of marks, description of each mark, explanation provided by the person/staff, photographs if appropriate, safeguarding referral if unexplained, link to incident report if applicable, follow-up assessment date.

Flag as CRITICAL: Unexplained marks without safeguarding referral; no body map for reported injury.
Flag as HIGH: Incomplete documentation; no explanation recorded; no follow-up.

Return JSON: {"documentType":"BODY_MAP","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 13","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  FLUID_FOOD_CHART: `Audit this fluid/food intake chart against SAF Quality Statements:
- E2 (Delivering evidence-based care): Is intake monitoring clinically appropriate and acted upon?

Check for: named individual, date, target intake (fluid ml per 24 hours), actual intake recorded per meal/drink, running total, staff initials per entry, escalation if target not met, link to nutritional assessment, review by nurse/senior, action taken for poor intake.

Flag as HIGH: Target intake consistently not met without escalation; no monitoring for at-risk individual.
Flag as MEDIUM: Missing entries; no target set; no staff initials.

Return JSON: {"documentType":"FLUID_FOOD_CHART","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 14","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  ACTIVITY_PROGRAMME: `Audit this activity programme against SAF Quality Statements:
- C3 (Independence, choice and control): Do activities promote independence and reflect individual preferences?

Check for: range of activities (physical, social, cognitive, creative), individualised to residents' interests and abilities, frequency, evidence of person involvement in planning, community engagement opportunities, one-to-one activities for less mobile residents, evaluation of engagement, adapted activities for diverse needs.

Flag as MEDIUM: Generic programme not reflecting individual preferences; no evaluation of engagement; no adapted activities.

Return JSON: {"documentType":"ACTIVITY_PROGRAMME","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 9","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  SERVICE_USER_AGREEMENT: `Audit this service user agreement against SAF Quality Statements:
- R3 (Providing information): Does the agreement clearly explain terms of care, rights, and fees?

Check for: named individual, services provided, fees and payment terms, notice period, complaints procedure, rights under the Care Act 2014, CQC registration reference, data protection/GDPR, review clause, signatures of all parties, date.

Flag as HIGH: No complaints procedure referenced; fees structure unclear; unsigned by service user or representative.
Flag as MEDIUM: Missing review clause; no data protection statement.

Return JSON: {"documentType":"SERVICE_USER_AGREEMENT","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 19","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  RESIDENT_SURVEY: `Audit this resident or family survey against SAF Quality Statements. Map responses to relevant Quality Statements across all five key questions. Identify themes of satisfaction and concern.

Check for: response rate, anonymity option, questions covering all five key questions (safe, effective, caring, responsive, well-led), analysis of results, action plan for concerns raised, feedback to respondents on actions taken, comparison with previous surveys.

Flag as HIGH: Response rate below 30% with no plan to improve; concerns raised without action plan.
Flag as MEDIUM: No analysis of results; no feedback to respondents; no comparison with previous surveys.

Return JSON: {"documentType":"RESIDENT_SURVEY","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"Reg 17","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,

  OTHER: `Review this care home document against CQC Regulations 9-20 of the Health and Social Care Act 2008. Map findings to relevant SAF Quality Statements (S1-S9, E1-E9, C1-C4, R1-R4, W1-W8). Identify compliance concerns, missing signatures, gaps, and areas for improvement.

Return JSON: {"documentType":"OTHER","auditDate":"<today>","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":<0-100>,"safStatements":[{"statementId":"...","statementName":"...","rating":"...","evidence":"..."}],"findings":[{"severity":"...","category":"...","description":"...","regulation":"...","safStatement":"..."}],"corrections":[{"finding":"...","correction":"...","policyReference":"...","priority":"...","exampleWording":"..."}],"summary":"..."}`,
};

function createFallbackResult(
  documentType: string,
  summary = 'Audit result could not be normalized from stored data.'
): DocumentAuditResult {
  return {
    documentType,
    auditDate: new Date().toISOString(),
    overallResult: 'NEEDS_IMPROVEMENT',
    complianceScore: 0,
    safStatements: [],
    findings: [],
    corrections: [],
    summary,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeComplianceScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function normalizeSafStatements(value: unknown): SAFStatementResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((statement) => {
      const rating = asText(statement.rating);

      return {
        statementId: asText(statement.statementId || statement.id),
        statementName: asText(statement.statementName || statement.name),
        rating: STATEMENT_RATINGS.has(rating as SAFStatementResult['rating'])
          ? (rating as SAFStatementResult['rating'])
          : 'NOT_MET',
        evidence: asText(statement.evidence),
      };
    })
    .filter((statement) => statement.statementId || statement.statementName || statement.evidence);
}

function normalizeFindings(value: unknown): AuditFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((finding) => {
      const severity = asText(finding.severity).toUpperCase();
      const regulatoryReference = asText(finding.regulatoryReference || finding.regulation);
      const safStatement = asText(finding.safStatement);

      return {
        severity: FINDING_SEVERITIES.has(severity as AuditFinding['severity'])
          ? (severity as AuditFinding['severity'])
          : 'MEDIUM',
        category: asText(finding.category) || 'General',
        description: asText(finding.description) || 'Compliance concern identified.',
        ...(regulatoryReference ? { regulatoryReference, regulation: regulatoryReference } : {}),
        ...(safStatement ? { safStatement } : {}),
      };
    });
}

function normalizeCorrections(value: unknown): AuditCorrection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((correction) => {
      const priority = asText(correction.priority).toUpperCase();
      const exampleWording = asText(correction.exampleWording);

      return {
        finding: asText(correction.finding) || 'Compliance concern identified.',
        correction: asText(correction.correction) || 'Review document and correct the missing detail.',
        policyReference: asText(correction.policyReference) || 'Internal policy review required.',
        priority: CORRECTION_PRIORITIES.has(priority as AuditCorrection['priority'])
          ? (priority as AuditCorrection['priority'])
          : 'THIS_WEEK',
        ...(exampleWording ? { exampleWording } : {}),
      };
    });
}

function parseAuditPayload(rawText: string): unknown {
  const cleaned = rawText.replace(/```json|```/gi, '').trim();
  if (!cleaned) {
    return null;
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function normalizeAuditResult(payload: unknown, defaultDocumentType: string): DocumentAuditResult {
  const fallback = createFallbackResult(defaultDocumentType);
  if (!isRecord(payload)) {
    return fallback;
  }

  const overallResult = asText(payload.overallResult).toUpperCase();
  const summary = asText(payload.summary);
  const documentType = asText(payload.documentType) || defaultDocumentType;
  const auditDate = asText(payload.auditDate) || new Date().toISOString();
  const findings = normalizeFindings(payload.findings);

  return {
    documentType,
    auditDate,
    overallResult: OVERALL_RESULTS.has(overallResult as DocumentAuditResult['overallResult'])
      ? (overallResult as DocumentAuditResult['overallResult'])
      : 'NEEDS_IMPROVEMENT',
    complianceScore: normalizeComplianceScore(payload.complianceScore),
    safStatements: normalizeSafStatements(payload.safStatements),
    findings,
    corrections: normalizeCorrections(payload.corrections),
    summary: summary || fallback.summary,
  };
}

function isMeaningfulAuditPayload(payload: unknown): payload is Record<string, unknown> {
  if (!isRecord(payload)) {
    return false;
  }

  const overallResult = asText(payload.overallResult).toUpperCase();
  return OVERALL_RESULTS.has(overallResult as DocumentAuditResult['overallResult'])
    && asText(payload.summary).length > 0;
}

const VALID_SAF_IDS = new Set([
  'S1','S2','S3','S4','S5','S6','S7','S8','S9',
  'E1','E2','E3','E4','E5','E6','E7','E8','E9',
  'C1','C2','C3','C4',
  'R1','R2','R3','R4',
  'W1','W2','W3','W4','W5','W6','W7','W8',
]);

function warnInvalidSafStatementIds(result: DocumentAuditResult): void {
  for (const stmt of result.safStatements) {
    if (stmt.statementId && !VALID_SAF_IDS.has(stmt.statementId)) {
      console.warn(`[AUDITOR] Invalid SAF statement ID: "${stmt.statementId}" — not in SAF 34 Quality Statements`);
    }
  }
}

function extractResponseText(response: any): string {
  const content = Array.isArray(response?.content) ? response.content : [];

  return content
    .filter((block: { type: string; text: string }) => block.type === 'text')
    .map((block: { type: string; text: string }) => block.text)
    .join('')
    .trim();
}

function countFindings(result: DocumentAuditResult, severity: AuditFinding['severity']): number {
  return result.findings.filter((finding) => finding.severity === severity).length;
}

function toOptionalIsoString(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = asText(value);
  return text || undefined;
}

function normalizeAuditStatus(value: unknown): DocumentAuditStatus {
  const status = asText(value).toUpperCase();
  return DOCUMENT_AUDIT_STATUSES.has(status as DocumentAuditStatus)
    ? (status as DocumentAuditStatus)
    : 'PENDING';
}

function createCompletedSummary(
  evidenceRecordId: string,
  fileName: string,
  result: DocumentAuditResult
): DocumentAuditSummary {
  return {
    status: 'COMPLETED',
    evidenceRecordId,
    documentType: result.documentType,
    originalFileName: fileName,
    overallResult: result.overallResult,
    complianceScore: result.complianceScore,
    criticalFindings: countFindings(result, 'CRITICAL'),
    highFindings: countFindings(result, 'HIGH'),
    summary: result.summary,
    auditedAt: result.auditDate,
    result,
  };
}

export function createDocumentAuditStatusSummary(
  status: Exclude<DocumentAuditStatus, 'COMPLETED'>,
  evidenceRecordId: string,
  options: {
    documentType?: string;
    originalFileName?: string;
    failureReason?: string;
  } = {}
): DocumentAuditSummary {
  return {
    status,
    evidenceRecordId,
    ...(options.documentType ? { documentType: options.documentType } : {}),
    ...(options.originalFileName ? { originalFileName: options.originalFileName } : {}),
    ...(options.failureReason ? { failureReason: options.failureReason } : {}),
  };
}

function mapDocumentAuditRow(row: Record<string, unknown>): StoredDocumentAudit {
  const inferredStatus =
    row.status === null || row.status === undefined || asText(row.status).length === 0
      ? (row.audit_result_json || row.overall_result ? 'COMPLETED' : 'PENDING')
      : row.status;
  const status = normalizeAuditStatus(inferredStatus);
  const documentType = asText(row.document_type) || 'OTHER';
  const baseRecord = {
    status,
    evidenceRecordId: asText(row.evidence_record_id),
    facilityId: asText(row.facility_id),
    providerId: asText(row.provider_id),
    documentType,
    originalFileName: asText(row.original_file_name),
    auditedAt: toOptionalIsoString(row.audited_at),
  };

  if (status !== 'COMPLETED') {
    return {
      ...baseRecord,
      ...(asText(row.failure_reason) ? { failureReason: asText(row.failure_reason) } : {}),
    };
  }

  const result = row.audit_result_json
    ? normalizeAuditResult(row.audit_result_json, documentType)
    : undefined;

  return {
    ...baseRecord,
    overallResult: OVERALL_RESULTS.has(asText(row.overall_result) as DocumentAuditResult['overallResult'])
      ? (asText(row.overall_result) as DocumentAuditResult['overallResult'])
      : result?.overallResult,
    complianceScore: row.compliance_score === null || row.compliance_score === undefined
      ? undefined
      : normalizeComplianceScore(row.compliance_score),
    criticalFindings: normalizeCount(row.critical_findings),
    highFindings: normalizeCount(row.high_findings),
    summary: result?.summary,
    ...(result ? { result } : {}),
  };
}

export function createPendingDocumentAuditSummary(
  evidenceRecordId: string,
  options: {
    documentType?: string;
    originalFileName?: string;
  } = {}
): DocumentAuditSummary {
  return createDocumentAuditStatusSummary('PENDING', evidenceRecordId, options);
}

export function getBlobPath(blobHash: string): string {
  const hashHex = blobHash.replace(/^sha256:/, '');

  return join(
    process.env.BLOB_STORAGE_PATH || '/var/regintel/evidence-blobs',
    hashHex.slice(0, 2),
    hashHex.slice(2, 4),
    hashHex
  );
}

async function upsertDocumentAuditRow(params: {
  tenantId: string;
  facilityId: string;
  providerId: string;
  evidenceRecordId: string;
  fileName: string;
  documentType: string;
  status: DocumentAuditStatus;
  result?: DocumentAuditResult;
  failureReason?: string;
}): Promise<void> {
  const pool = await getPgPool();
  if (!pool) {
    console.warn('[AUDITOR] DATABASE_URL is not set; skipping audit persistence.');
    return;
  }

  const normalizedResult = params.result
    ? normalizeAuditResult(params.result, params.documentType)
    : undefined;
  const crit = normalizedResult ? countFindings(normalizedResult, 'CRITICAL') : 0;
  const high = normalizedResult ? countFindings(normalizedResult, 'HIGH') : 0;

  try {
    await pool.query(
      `INSERT INTO document_audits (
         tenant_id, facility_id, provider_id, evidence_record_id, document_type, original_file_name,
         status, overall_result, compliance_score, critical_findings, high_findings,
         audit_result_json, failure_reason, audited_at, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12::jsonb, $13, $14, NOW(), NOW()
       )
       ON CONFLICT (tenant_id, evidence_record_id)
       DO UPDATE SET
         facility_id = EXCLUDED.facility_id,
         provider_id = EXCLUDED.provider_id,
         document_type = EXCLUDED.document_type,
         original_file_name = EXCLUDED.original_file_name,
         status = EXCLUDED.status,
         overall_result = EXCLUDED.overall_result,
         compliance_score = EXCLUDED.compliance_score,
         critical_findings = EXCLUDED.critical_findings,
         high_findings = EXCLUDED.high_findings,
         audit_result_json = EXCLUDED.audit_result_json,
         failure_reason = EXCLUDED.failure_reason,
         audited_at = EXCLUDED.audited_at,
         updated_at = NOW()`,
      [
        params.tenantId,
        params.facilityId,
        params.providerId,
        params.evidenceRecordId,
        normalizedResult?.documentType ?? params.documentType,
        params.fileName,
        params.status,
        normalizedResult?.overallResult ?? null,
        normalizedResult?.complianceScore ?? null,
        crit,
        high,
        normalizedResult ? JSON.stringify(normalizedResult) : null,
        params.failureReason ?? null,
        normalizedResult?.auditDate ?? null,
      ]
    );
    console.log('[AUDITOR] Saved:', params.evidenceRecordId, params.status);
  } catch (error) {
    console.error('[AUDITOR] Failed to persist document audit:', error);
  }
}

export async function savePendingDocumentAudit(params: {
  tenantId: string;
  facilityId: string;
  providerId: string;
  evidenceRecordId: string;
  fileName: string;
  documentType: string;
}): Promise<void> {
  await upsertDocumentAuditRow({
    ...params,
    status: 'PENDING',
  });
}

export async function saveDocumentAuditFailure(params: {
  tenantId: string;
  facilityId: string;
  providerId: string;
  evidenceRecordId: string;
  fileName: string;
  documentType: string;
  status: Exclude<DocumentAuditStatus, 'PENDING' | 'COMPLETED'>;
  failureReason: string;
}): Promise<void> {
  await upsertDocumentAuditRow(params);
}

export async function saveDocumentAudit(params: {
  tenantId: string;
  facilityId: string;
  providerId: string;
  evidenceRecordId: string;
  fileName: string;
  result: DocumentAuditResult;
}): Promise<void> {
  await upsertDocumentAuditRow({
    ...params,
    documentType: params.result.documentType,
    status: 'COMPLETED',
    result: params.result,
  });
}

export async function listDocumentAuditSummariesByEvidenceRecordIds(
  tenantId: string,
  evidenceRecordIds: string[]
): Promise<Map<string, DocumentAuditSummary>> {
  if (evidenceRecordIds.length === 0) {
    return new Map();
  }

  const pool = await getPgPool();
  if (!pool) {
    return new Map();
  }

  try {
    const { rows } = await pool.query(
      `SELECT evidence_record_id, facility_id, provider_id, document_type, original_file_name,
              status, overall_result, compliance_score, critical_findings, high_findings,
              audit_result_json, failure_reason, audited_at
         FROM document_audits
        WHERE tenant_id = $1
          AND evidence_record_id = ANY($2::text[])`,
      [tenantId, evidenceRecordIds]
    );

    return new Map(
      rows.map((row: Record<string, unknown>) => {
        const audit = mapDocumentAuditRow(row);
        return [audit.evidenceRecordId, audit] as const;
      })
    );
  } catch (error) {
    console.error('[AUDITOR] Failed to load document audit summaries:', error);
    return new Map();
  }
}

export async function getDocumentAuditByEvidenceRecordId(
  tenantId: string,
  evidenceRecordId: string
): Promise<DocumentAuditSummary | null> {
  const pool = await getPgPool();
  if (!pool) {
    return null;
  }

  try {
    const { rows } = await pool.query(
      `SELECT evidence_record_id, facility_id, provider_id, document_type, original_file_name,
              status, overall_result, compliance_score, critical_findings, high_findings,
              audit_result_json, failure_reason, audited_at
         FROM document_audits
        WHERE tenant_id = $1
          AND evidence_record_id = $2
        LIMIT 1`,
      [tenantId, evidenceRecordId]
    );

    if (rows.length === 0) {
      return null;
    }

    return mapDocumentAuditRow(rows[0] as Record<string, unknown>);
  } catch (error) {
    console.error('[AUDITOR] Failed to load document audit:', error);
    return null;
  }
}

export function detectDocumentType(
  fileName: string,
  mimeType: string,
  evidenceType?: string
): string {
  void mimeType;
  const name = fileName.toLowerCase();

  if (name.includes('mar') || name.includes('medication') || name.includes('medic')) {
    return 'MAR_CHART';
  }

  if (
    name.includes('sign') ||
    name.includes('rota') ||
    name.includes('attendance') ||
    name.includes('timesheet')
  ) {
    return 'SIGN_IN_OUT';
  }

  if (name.includes('care plan') || name.includes('care-plan') || name.includes('careplan')) {
    return 'CARE_PLAN';
  }

  if (name.includes('incident') || name.includes('accident')) {
    return 'INCIDENT_REPORT';
  }

  if (name.includes('training') || name.includes('matrix') || name.includes('competency')) {
    return 'TRAINING_MATRIX';
  }

  if (name.includes('supervision') || name.includes('appraisal')) {
    return 'SUPERVISION_RECORD';
  }

  if (name.includes('audit')) {
    return 'AUDIT_REPORT';
  }

  if (name.includes('policy') || name.includes('procedure') || name.includes('protocol')) {
    return 'POLICY_DOCUMENT';
  }

  if (name.includes('certificate') || name.includes('cert')) {
    return 'CERTIFICATE';
  }

  if (name.includes('risk assessment') || name.includes('risk-assessment') || name.includes('riskassessment')) {
    return 'RISK_ASSESSMENT';
  }

  if (name.includes('daily notes') || name.includes('daily-notes') || name.includes('progress notes')) {
    return 'DAILY_NOTES';
  }

  if (name.includes('handover')) {
    return 'HANDOVER_NOTES';
  }

  if (name.includes('dols') || name.includes('mca') || name.includes('capacity assessment') || name.includes('deprivation of liberty')) {
    return 'DOLS_MCA_ASSESSMENT';
  }

  if (name.includes('safeguarding') || name.includes('safeguard')) {
    return 'SAFEGUARDING_RECORD';
  }

  if (name.includes('complaint')) {
    return 'COMPLAINTS_LOG';
  }

  if (name.includes('meeting minutes') || name.includes('staff meeting') || name.includes('team meeting')) {
    return 'STAFF_MEETING_MINUTES';
  }

  if (name.includes('recruitment') || name.includes('dbs') || name.includes('references check')) {
    return 'RECRUITMENT_FILE';
  }

  if (name.includes('fire safety') || name.includes('fire drill') || name.includes('fire risk') || name.includes('environmental check')) {
    return 'FIRE_SAFETY_CHECK';
  }

  if (name.includes('infection control') || name.includes('ipc') || name.includes('infection prevention')) {
    return 'INFECTION_CONTROL_AUDIT';
  }

  if (name.includes('equipment') || name.includes('maintenance log') || name.includes('loler') || name.includes('pat test')) {
    return 'EQUIPMENT_MAINTENANCE_LOG';
  }

  if (name.includes('nutritional') || name.includes('must score') || name.includes('malnutrition')) {
    return 'NUTRITIONAL_ASSESSMENT';
  }

  if (name.includes('wound') || name.includes('tissue viability') || name.includes('pressure ulcer')) {
    return 'WOUND_CARE_RECORD';
  }

  if (name.includes('body map') || name.includes('bodymap')) {
    return 'BODY_MAP';
  }

  if (name.includes('fluid chart') || name.includes('food chart') || name.includes('intake chart')) {
    return 'FLUID_FOOD_CHART';
  }

  if (name.includes('activit') && (name.includes('programme') || name.includes('program') || name.includes('schedule'))) {
    return 'ACTIVITY_PROGRAMME';
  }

  if (name.includes('service user agreement') || name.includes('resident agreement') || name.includes('terms of care')) {
    return 'SERVICE_USER_AGREEMENT';
  }

  if (name.includes('survey') || name.includes('questionnaire') || name.includes('feedback form')) {
    return 'RESIDENT_SURVEY';
  }

  const normalizedEvidenceType = asText(evidenceType).toUpperCase();
  if (normalizedEvidenceType && DOCUMENT_TYPE_BY_EVIDENCE_TYPE[normalizedEvidenceType]) {
    return DOCUMENT_TYPE_BY_EVIDENCE_TYPE[normalizedEvidenceType];
  }

  return 'OTHER';
}

export async function auditDocument(
  docType: string,
  blobPath: string,
  facilityName: string,
  mimeType: string = '',
  fileName: string = ''
): Promise<DocumentAuditResult> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new DocumentAuditExecutionError(
      'SKIPPED',
      'Audit skipped because ANTHROPIC_API_KEY is not configured.'
    );
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(blobPath);
  } catch (error) {
    console.error('[AUDITOR] Blob not found:', blobPath, error);
    throw new DocumentAuditExecutionError(
      'FAILED',
      'Evidence blob could not be read for auditing.'
    );
  }

  try {
    const mime = mimeType.toLowerCase();
    const fname = fileName.toLowerCase();
    const isPdf = fileBuffer.subarray(0, 4).toString('utf8') === '%PDF' || mime === 'application/pdf';
    const isDocx = fname.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isXlsx = fname.endsWith('.xlsx') || fname.endsWith('.xls') || mime.includes('spreadsheet') || mime.includes('excel');
    const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(fname);

    let messageContent: any[];
    const prompt = AUDIT_PROMPTS[docType] ?? AUDIT_PROMPTS.OTHER;
    const facilityPrefix = `Facility: ${facilityName}\n\n`;

    // PDFs over 20 MB are too large to send efficiently; fall back to text-only prompt
    const PDF_MAX_BYTES = 20 * 1024 * 1024;
    if (isPdf) {
      if (fileBuffer.length > PDF_MAX_BYTES) {
        const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(1);
        messageContent = [
          {
            type: 'text',
            text: `${facilityPrefix}Document: ${fileName} (${sizeMb} MB PDF — too large for direct analysis)\n` +
              `Document type classification: ${docType}\n` +
              `Perform a compliance risk assessment based on document type and provide a structured response.\n\n` +
              prompt,
          },
        ];
      } else {
        const b64 = fileBuffer.toString('base64');
        messageContent = [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } as any },
          { type: 'text', text: facilityPrefix + prompt },
        ];
      }
    } else if (isDocx) {
      const { value: docText } = await mammoth.extractRawText({ buffer: fileBuffer });
      messageContent = [
        { type: 'text', text: `${facilityPrefix}Document content:\n${docText.slice(0, 15000)}\n\n${prompt}` },
      ];
    } else if (isXlsx) {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheets = workbook.SheetNames.map((sheetName) =>
        `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`
      ).join('\n\n');
      messageContent = [
        { type: 'text', text: `${facilityPrefix}Spreadsheet content:\n${sheets.slice(0, 15000)}\n\n${prompt}` },
      ];
    } else if (isImage) {
      const imgMime = mime.startsWith('image/') ? mime : 'image/jpeg';
      const b64 = fileBuffer.toString('base64');
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: imgMime, data: b64 } as any },
        { type: 'text', text: facilityPrefix + prompt },
      ];
    } else {
      const textContent = fileBuffer.toString('utf8', 0, 15000);
      messageContent = [
        { type: 'text', text: `${facilityPrefix}Document content:\n${textContent}\n\n${prompt}` },
      ];
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      system: SYSTEM_PROMPT,
      max_tokens: 4096,
      messages: [{ role: 'user', content: messageContent }],
    });
    const rawText = extractResponseText(response);
    const usage = (response as any).usage;
    if (usage) {
      console.log(`[AUDITOR] token usage: input=${usage.input_tokens} output=${usage.output_tokens}`);
    }
    console.log('[AUDITOR] raw response (first 600 chars):', rawText.substring(0, 600));
    const parsed = parseAuditPayload(rawText);

    if (!isMeaningfulAuditPayload(parsed)) {
      console.log('[AUDITOR] parse failed — overallResult:', (parsed as any)?.overallResult, '| summary length:', asText((parsed as any)?.summary).length);
      throw new DocumentAuditExecutionError(
        'FAILED',
        'Audit response could not be parsed into a valid result.'
      );
    }

    const result = normalizeAuditResult(parsed, docType);
    warnInvalidSafStatementIds(result);
    return result;
  } catch (error) {
    if (error instanceof DocumentAuditExecutionError) {
      throw error;
    }

    console.error('[AUDITOR] audit failed', error);
    throw new DocumentAuditExecutionError(
      'FAILED',
      'Audit request failed. Review manually or retry.'
    );
  }
}

export async function runDocumentAuditForEvidence(params: {
  tenantId: string;
  facilityId: string;
  facilityName: string;
  providerId: string;
  evidenceRecordId: string;
  blobHash: string;
  storagePath?: string;
  fileName: string;
  mimeType: string;
  evidenceType?: string;
}): Promise<DocumentAuditSummary> {
  const documentType = detectDocumentType(params.fileName, params.mimeType, params.evidenceType);

  try {
    const result = await auditDocument(
      documentType,
      params.storagePath || getBlobPath(params.blobHash),
      params.facilityName,
      params.mimeType,
      params.fileName
    );

    await saveDocumentAudit({
      tenantId: params.tenantId,
      facilityId: params.facilityId,
      providerId: params.providerId,
      evidenceRecordId: params.evidenceRecordId,
      fileName: params.fileName,
      result,
    });

    return createCompletedSummary(params.evidenceRecordId, params.fileName, result);
  } catch (error) {
    const failureReason = error instanceof Error
      ? error.message
      : 'Audit could not be completed. Review manually or retry.';
    const status = error instanceof DocumentAuditExecutionError
      ? error.status
      : 'FAILED';

    await saveDocumentAuditFailure({
      tenantId: params.tenantId,
      facilityId: params.facilityId,
      providerId: params.providerId,
      evidenceRecordId: params.evidenceRecordId,
      fileName: params.fileName,
      documentType,
      status,
      failureReason,
    });

    return createDocumentAuditStatusSummary(status, params.evidenceRecordId, {
      documentType,
      originalFileName: params.fileName,
      failureReason,
    });
  }
}
