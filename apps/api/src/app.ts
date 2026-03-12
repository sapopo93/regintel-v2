import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {
  SessionStatus,
  type DraftFinding,
  type MockInspectionSession as DomainSession,
} from '@regintel/domain/mock-inspection-engine';
import { Domain, FindingOrigin, ReportingDomain, Severity } from '@regintel/domain/types';
import {
  EXPORT_WATERMARK,
  generateCsvExport,
  generatePdfExport,
  serializeCsvExport,
  type CsvActionRecord,
  type CsvEvidenceRecord,
} from '@regintel/domain/readiness-export';
import { renderFindingsPdf, renderInspectorPackPdf, renderBlueOceanBoardPdf, renderBlueOceanAuditPdf } from './renderers/pdf-renderer';
import { renderFindingsDocx, renderInspectorPackDocx, renderBlueOceanBoardDocx, renderBlueOceanAuditDocx } from './renderers/docx-renderer';
import type { RenderOutput } from './renderers/renderer-types';
import {
  QUEUE_NAMES,
  getQueueAdapter,
  processInMemoryJob,
  type QueueName,
  type ScrapeReportJobData,
  type ScrapeReportJobResult,
  type MalwareScanJobData,
  type MalwareScanJobResult,
  type EvidenceProcessJobData,
  type AIInsightJobData,
  type AIInsightJobResult,
} from '@regintel/queue';
import { generateBlueOceanReport } from '@regintel/domain/blue-ocean-report';
import {
  serializeBlueOceanBoardMarkdown,
  serializeBlueOceanAuditMarkdown,
} from '@regintel/domain/blue-ocean-renderers';
import { z, type ZodTypeAny, ZodError } from 'zod';
import { computeProvenanceHash, computeCompositeRiskScore } from '@regintel/domain/inspection-finding';
import type { Action } from '@regintel/domain/action';
import { ActionStatus } from '@regintel/domain/action';
import { onboardFacility } from '@regintel/domain/onboarding';
import {
  scrapeLatestReport,
  buildHtmlReportBuffer,
  buildCqcReportSummary,
  isWebsiteReportNewer,
} from '@regintel/domain/cqc-scraper';
import { EvidenceType } from '@regintel/domain/evidence-types';
import { resolveFacilityContext, type FacilityContext } from '@regintel/domain/facility-context';
import { computeAdjustedSeverityScore } from '@regintel/domain/prs-logic-profile';
import { getQualityStatementCoverage, SAF_34_QUALITY_STATEMENTS } from '@regintel/domain/saf34';
import { fetchCqcLocation } from '@regintel/domain/cqc-client';
import {
  generateInspectorEvidencePack,
  serializeInspectorPackMarkdown,
  type EvidenceInput,
  type FindingInput,
} from '@regintel/domain/inspector-evidence-pack';
import { fetchCqcLocations, fetchCqcLocationDetail, getNoteworthy } from '@regintel/domain/cqc-changes-client';
import { ACTION_PLAN_TEMPLATES } from './action-plan-templates';
import {
  generateAlerts,
  deduplicateAlerts,
  capAlerts,
  alertDeduplicationKey,
  type CqcReportForIntelligence,
  type ProviderCoverageForIntelligence,
} from '@regintel/domain/cqc-intelligence';
import { buildConstitutionalMetadata, type ReportContext } from './metadata';
import { authMiddleware } from './auth';
import {
  InMemoryStore,
  type TenantContext,
  type EvidenceRecordRecord,
  type MockSessionRecord,
  type FindingRecord,
  type ActionRecord,
  computePlanStatus,
} from './store';
import { PrismaStore } from './db-store';
import { handleClerkWebhook } from './webhooks/clerk';
import { blobStorage } from './blob-storage';
import { scanBlob } from './malware-scanner';
import {
  createDocumentAuditStatusSummary,
  createPendingDocumentAuditSummary,
  detectDocumentType,
  getDocumentAuditByEvidenceRecordId,
  listDocumentAuditSummariesByEvidenceRecordIds,
  listCompletedAuditsByFacility,
  saveDocumentAuditFailure,
  savePendingDocumentAudit,
  type DocumentAuditSummary,
  type StoredDocumentAudit,
  type AuditFinding,
  type AuditCorrection,
} from './document-auditor';
import type { DocumentAuditJobData } from './audit-worker';

//  Memory safety helpers 
const MAP_CAP = 500;
function setBounded<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.set(key, value);
  if (map.size > MAP_CAP) {
    map.delete(map.keys().next().value!);
  }
}
const asyncRoute = (fn: (req: any, res: any, next: any) => Promise<any>) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
// 


const useDbStore =
  process.env.USE_DB_STORE === 'true' ||
  (process.env.NODE_ENV !== 'test' && process.env.USE_DB_STORE !== 'false');
const store = useDbStore ? new PrismaStore() : new InMemoryStore();

// Queue adapters (BullMQ with in-memory fallback)
const scrapeReportQueue = getQueueAdapter(QUEUE_NAMES.SCRAPE_REPORT);
const malwareScanQueue = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);
const documentAuditQueue = getQueueAdapter(QUEUE_NAMES.DOCUMENT_AUDIT);
const evidenceProcessQueue = getQueueAdapter(QUEUE_NAMES.EVIDENCE_PROCESS);
const aiInsightQueue = getQueueAdapter(QUEUE_NAMES.AI_INSIGHT);

// In-memory job indexes (fallback only)
const blobScanJobs = new Map<string, string>();
const mockInsightJobs = new Map<string, string>();

const TOPICS = [
  // ─── SAFE ───────────────────────────────────────────────────────────────────
  {
    id: 'safe-care-treatment',
    title: 'Safe Care and Treatment',
    regulationSectionId: 'Reg 12(2)(a)',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'safeguarding',
    title: 'Safeguarding Service Users from Abuse',
    regulationSectionId: 'Reg 13',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'medication-management',
    title: 'Medication Management',
    regulationSectionId: 'Reg 12(2)(b)',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'infection-prevention-control',
    title: 'Infection Prevention and Control',
    regulationSectionId: 'Reg 12(2)(h)',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'risk-assessment',
    title: 'Risk Assessment and Management',
    regulationSectionId: 'Reg 12(2)(a)',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'premises-equipment',
    title: 'Premises and Equipment',
    regulationSectionId: 'Reg 15',
    evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.CERTIFICATE],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'deprivation-of-liberty',
    title: 'Deprivation of Liberty Safeguards',
    regulationSectionId: 'Reg 13(3)',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 4,
  },

  // ─── EFFECTIVE ──────────────────────────────────────────────────────────────
  {
    id: 'person-centred-care',
    title: 'Person-Centred Care',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'consent',
    title: 'Consent to Care and Treatment',
    regulationSectionId: 'Reg 11',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'nutrition-hydration',
    title: 'Nutrition and Hydration',
    regulationSectionId: 'Reg 14',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'staff-training-development',
    title: 'Staff Training and Development',
    regulationSectionId: 'Reg 18',
    evidenceRequirements: [EvidenceType.TRAINING, EvidenceType.CERTIFICATE, EvidenceType.SKILLS_MATRIX],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'supervision-appraisal',
    title: 'Supervision and Appraisal',
    regulationSectionId: 'Reg 18(1)',
    evidenceRequirements: [EvidenceType.SUPERVISION, EvidenceType.POLICY],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'mental-capacity-act',
    title: 'Mental Capacity Act Compliance',
    regulationSectionId: 'Reg 11',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 4,
  },

  // ─── CARING ─────────────────────────────────────────────────────────────────
  {
    id: 'dignity-respect',
    title: 'Dignity and Respect',
    regulationSectionId: 'Reg 10',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'service-user-involvement',
    title: 'Service User Involvement',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'emotional-social-wellbeing',
    title: 'Emotional and Social Wellbeing',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'end-of-life-care',
    title: 'End of Life Care',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 4,
  },

  // ─── RESPONSIVE ─────────────────────────────────────────────────────────────
  {
    id: 'complaints-handling',
    title: 'Complaints Handling',
    regulationSectionId: 'Reg 16',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'care-planning-review',
    title: 'Care Planning and Review',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'meeting-individual-needs',
    title: 'Meeting Individual Needs',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'transitions-discharge',
    title: 'Transitions and Discharge Planning',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'equality-diversity',
    title: 'Equality and Diversity',
    regulationSectionId: 'Reg 9',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },

  // ─── WELL-LED ────────────────────────────────────────────────────────────────
  {
    id: 'governance-oversight',
    title: 'Governance and Oversight',
    regulationSectionId: 'Reg 17',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'quality-assurance',
    title: 'Quality Assurance and Improvement',
    regulationSectionId: 'Reg 17',
    evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'staff-recruitment',
    title: 'Staff Recruitment and DBS',
    regulationSectionId: 'Reg 19',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.CERTIFICATE, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'fit-proper-persons',
    title: 'Fit and Proper Persons',
    regulationSectionId: 'Reg 20',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.CERTIFICATE, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'whistleblowing-openness',
    title: 'Whistleblowing and Duty of Candour',
    regulationSectionId: 'Reg 17',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'notifications-cqc',
    title: 'Notifications to CQC',
    regulationSectionId: 'Reg 18',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'financial-sustainability',
    title: 'Financial Sustainability',
    regulationSectionId: 'Reg 17',
    evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'records-management',
    title: 'Records Management',
    regulationSectionId: 'Reg 17',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'staff-wellbeing',
    title: 'Staff Wellbeing and Support',
    regulationSectionId: 'Reg 18',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.SUPERVISION, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'learning-from-incidents',
    title: 'Learning from Incidents and Accidents',
    regulationSectionId: 'Reg 17',
    evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.POLICY, EvidenceType.TRAINING],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'partnership-working',
    title: 'Partnership Working and Referrals',
    regulationSectionId: 'Reg 17',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.AUDIT],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
  {
    id: 'staffing',
    title: 'Staffing Levels and Skill Mix',
    regulationSectionId: 'Reg 18(1)',
    evidenceRequirements: [EvidenceType.ROTA, EvidenceType.SKILLS_MATRIX, EvidenceType.SUPERVISION],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
];

const MOCK_QUESTION_BANK: Record<string, string[]> = {
  'safe-care-treatment': [
    "Under Regulation 12(2)(a), providers must assess and mitigate risks to people's health and safety. Walk me through your current risk assessment process — how are individual risk assessments initiated, who carries them out, and how often are they reviewed?",
    "You've described your process. Can you tell me specifically what evidence you hold that demonstrates staff are following these risk assessments in practice? I'm looking for audit trails, observation records, or incident reviews.",
    "When a risk assessment identifies a significant risk, what's your escalation pathway? Give me a recent example of a high-risk situation and how it was managed end to end.",
    "How do you ensure risk assessments are updated when someone's condition changes unexpectedly — for example after a fall, a hospital admission, or a change in mental capacity?",
    "Regulation 12(2)(a) requires oversight at provider level, not just care-plan level. How does senior leadership monitor that risk management is effective across all service users? What does your governance evidence look like?",
  ],
  'safeguarding': [
    "Under Regulation 13, you must protect people from abuse and improper treatment. Describe your safeguarding policy — when did it last have a full review, who owns it, and is it aligned with your local authority's safeguarding procedures?",
    "How do staff recognise and report safeguarding concerns? Walk me through the last safeguarding referral you made — what triggered it, what steps were taken, and what was the outcome?",
    "What training do staff receive on safeguarding, and how do you verify it's been understood — not just attended? Are there any staff currently overdue for refresher training?",
    "How do you handle allegations against staff or volunteers? What's your Deprivation of Liberty (DoLS) authorisation count currently, and are all authorisations in date?",
    "What oversight does your registered manager or provider have of safeguarding trends across the service? How would you identify if safeguarding was becoming a systemic issue rather than isolated incidents?",
  ],
  'medication-management': [
    "Under Regulation 12(2)(b), safe management of medicines is essential. Describe your medicines policy — who is responsible for medicines management, how are medicines stored, and what's your controlled drugs procedure?",
    "How do you ensure medicines are administered as prescribed? Walk me through a recent medicines audit — what did it find, and what actions were taken as a result?",
    "What happens when a medicines administration error occurs? Describe your error reporting process and give an example of a learning outcome from a recent error.",
    "How do you manage medicines for people who self-administer? What risk assessments are in place, and how are competencies for medicines administration assessed in staff?",
    "How does your provider-level governance monitor medicines safety? What KPIs do you track, and when was your last medicines-focused quality assurance review?",
  ],
  'infection-prevention-control': [
    "Under Regulation 12(2)(h), you must protect people from the risk of healthcare-associated infections. Who is your IPC lead, and how are they supported to keep their knowledge current with national guidance?",
    "Walk me through your IPC audit programme — what areas are audited, how frequently, and what happens when an audit identifies a gap?",
    "How do you manage an outbreak scenario — for example, a norovirus outbreak? What's your notification process and isolation procedure?",
    "How do you ensure cleaning standards are consistently met across all shifts? What evidence do you hold that the environment is safe from an infection control perspective?",
  ],
  'risk-assessment': [
    "Regulation 12(2)(a) requires systematic assessment and mitigation of risk. How is your risk assessment framework structured — what tools do you use and how do they connect to care planning?",
    "How do you ensure risk assessments reflect the person's current condition? What triggers an unplanned review, and who is responsible for initiating it?",
    "Can you describe how environmental and operational risks are captured — not just individual service user risks? For example, premises hazards, staffing risks, or equipment failures.",
    "How does senior management receive assurance that risk management is effective? What does your governance reporting on risk look like?",
  ],
  'premises-equipment': [
    "Under Regulation 15, premises and equipment must be safe and suitable. Who is responsible for managing planned and reactive maintenance, and what system do you use to track outstanding works?",
    "What statutory checks are you required to carry out — such as gas safety, electrical testing, or fire risk assessments — and can you confirm all are current?",
    "How do you manage equipment that is critical to care delivery — such as hoists, pressure-relieving mattresses, or call systems? What's your inspection and servicing schedule?",
    "Walk me through your last premises audit. What was found, what remedial action was taken, and how was completion verified?",
  ],
  'deprivation-of-liberty': [
    "Under Regulation 13(3), you must not deprive a person of their liberty without a lawful authorisation. How many residents currently have DoLS authorisations in place, and are all of them current?",
    "What is your process for identifying whether a resident may be deprived of their liberty? Who makes the initial assessment, and how is a referral to the supervisory body made?",
    "How do you ensure that conditions attached to DoLS authorisations are being met in practice? Give me an example of how conditions have been implemented for a current resident.",
    "What training do staff receive specifically on MCA and DoLS? How do you assess whether staff are applying the principles correctly in day-to-day practice?",
    "How does your service governance oversee DoLS compliance? Who monitors expiry dates, and what's your process if an authorisation lapses before renewal?",
  ],
  'person-centred-care': [
    "Under Regulation 9, care must be person-centred and based on a comprehensive assessment. Walk me through how a new resident's care plan is developed — who is involved, what assessments are used, and how are the person's preferences captured?",
    "How do residents and their families genuinely shape care delivery — not just at care plan review but day to day? Give me a recent example of care being adapted to reflect someone's expressed preference.",
    "How do you support residents who have difficulty communicating their wishes? What tools or approaches do you use to ensure their voice is central to decisions about their care?",
    "How do you know care plans are being followed in practice? What monitoring or observation methods do you use to verify that staff are delivering care as planned?",
    "What feedback mechanisms do you have in place, and how does feedback from residents and families lead to actual changes in care delivery?",
  ],
  'consent': [
    "Under Regulation 11, you must obtain valid consent before providing care. Describe your consent framework — how do you assess capacity, document consent decisions, and review them when circumstances change?",
    "How do staff ensure that consent is genuinely informed — that the person understands what they are agreeing to? How is this documented in practice?",
    "When a person lacks capacity, what process do you follow to make decisions in their best interests? Give me a recent example of a best interests decision and how it was recorded.",
    "How do you handle a situation where a person with capacity refuses care? Walk me through how you balance their right to refuse with your duty of care.",
    "How does your governance oversee consent practice across the service? When was your last consent-focused audit, and what did it find?",
  ],
  'nutrition-hydration': [
    "Under Regulation 14, you must ensure people receive adequate nutrition and hydration. What assessment tools do you use, and how are nutrition and hydration needs incorporated into each person's care plan?",
    "How do you identify and respond to someone who is at risk of malnutrition or dehydration? Give me a recent example and describe the intervention pathway.",
    "How are dietary preferences, cultural needs, and clinical requirements balanced in your menu planning? How do you get feedback from residents on food quality?",
    "What monitoring do you carry out to ensure nutrition and hydration plans are being followed? How do you record fluid and food intake for high-risk residents?",
  ],
  'staffing': [
    "Under Regulation 18, you must deploy sufficient numbers of suitably qualified staff. How do you calculate your staffing levels — what tool or method do you use, and how often is the calculation reviewed?",
    "Walk me through how you manage unplanned staff absences. What is your escalation process, and how do you ensure safe staffing levels are maintained through a bank or agency?",
    "How do you assess and develop staff competencies? What's your supervision and appraisal cycle, and how do you identify training needs?",
    "What's your current vacancy rate, and how is it being managed? How do you ensure new starters are effectively inducted before working unsupervised?",
    "How does your governance board or registered manager receive assurance about staffing adequacy? What staffing KPIs are reported, and what would trigger a formal review?",
  ],
  'governance-leadership': [
    "Under Regulation 17, you must operate an effective system of governance. Describe your quality assurance framework — what audits, checks, and reviews form your governance cycle?",
    "How does your registered manager maintain oversight of quality and safety across the service? What reporting do they receive, and how do they act on it?",
    "Walk me through a recent significant event — a serious complaint, a safeguarding concern, or a regulatory notification — and describe how your governance system responded.",
    "How do you ensure that learning from incidents, complaints, and audits leads to sustained improvement rather than one-off actions?",
    "How are people who use the service, and their families, involved in governance? Give me an example of how feedback has driven a change in the way you operate.",
  ],
  'dignity-respect': [
    "Regulation 10 requires that people are treated with dignity and respect. How do you ensure this is embedded in day-to-day care delivery, not just in policy?",
    "How do you monitor whether staff are treating people with dignity in practice — particularly during personal care or when people are distressed?",
    "Give me an example of how you have responded when you identified that someone was not being treated with dignity. What was the situation and what action did you take?",
    "How do you support people to maintain their identity, relationships, and lifestyle in a way that is meaningful to them?",
    "How does your governance oversee dignity and respect? What feedback mechanisms do you use, and how is feedback acted upon?",
  ],
};

function selectQuestion(topicId: string, questionNumber: number): string {
  const questions = MOCK_QUESTION_BANK[topicId];
  if (!questions || questions.length === 0) {
    return `Question ${questionNumber + 1}: Please describe your processes and evidence for this inspection area.`;
  }
  const idx = Math.min(questionNumber, questions.length - 1);
  return questions[idx];
}

// ── Action Plan Templates ──────────────────────────────────────────────────────
// Fallback templates per topic. When document audits exist, their findings take priority.

interface ActionTemplate {
  title: string;
  description: string;
  category: ActionRecord['category'];
  priority: ActionRecord['priority'];
  defaultOwner: string;
  defaultDueDays: number;
}

const ACTION_TEMPLATES: Record<string, ActionTemplate[]> = {
  'safe-care-treatment': [
    { title: 'Upload current risk assessment policy', description: 'Upload your risk assessment policy with most recent review date, named owner, and alignment with CQC Regulation 12(2)(a).', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide evidence of risk assessment audit', description: 'Upload your most recent risk assessment audit showing compliance rate, actions taken, and sign-off.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'Quality Lead', defaultDueDays: 14 },
    { title: 'Confirm staff risk assessment training', description: 'Provide training records showing staff have completed risk assessment training within the last 12 months.', category: 'TRAINING', priority: 'MEDIUM', defaultOwner: 'Training Coordinator', defaultDueDays: 21 },
  ],
  'safeguarding': [
    { title: 'Upload current safeguarding policy', description: 'Upload your safeguarding adults policy with most recent review date, owner, and local authority alignment.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide safeguarding referral log', description: 'Upload your safeguarding referral log showing referrals made, outcomes, and learning actions.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'Safeguarding Lead', defaultDueDays: 14 },
    { title: 'Confirm safeguarding training records', description: 'Provide evidence that all staff have completed safeguarding training within the required timeframe.', category: 'TRAINING', priority: 'HIGH', defaultOwner: 'Training Coordinator', defaultDueDays: 14 },
    { title: 'Review DoLS tracker', description: 'Confirm all Deprivation of Liberty Safeguards authorisations are current and conditions are being met.', category: 'PROCESS', priority: 'MEDIUM', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
  ],
  'medication-management': [
    { title: 'Upload medicines management policy', description: 'Upload your medicines policy covering storage, administration, controlled drugs, and error reporting.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide recent medicines audit', description: 'Upload your most recent medicines audit with findings, actions taken, and completion evidence.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'Clinical Lead', defaultDueDays: 14 },
    { title: 'Confirm medicines competency assessments', description: 'Provide staff competency assessment records for medicines administration.', category: 'TRAINING', priority: 'MEDIUM', defaultOwner: 'Training Coordinator', defaultDueDays: 21 },
  ],
  'infection-prevention-control': [
    { title: 'Upload IPC policy', description: 'Upload your infection prevention and control policy with named IPC lead and review date.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'IPC Lead', defaultDueDays: 7 },
    { title: 'Provide IPC audit evidence', description: 'Upload your most recent IPC audit showing areas covered, findings, and corrective actions.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'IPC Lead', defaultDueDays: 14 },
    { title: 'Confirm IPC training compliance', description: 'Provide evidence that all staff have completed IPC training within the required period.', category: 'TRAINING', priority: 'MEDIUM', defaultOwner: 'Training Coordinator', defaultDueDays: 21 },
  ],
  'risk-assessment': [
    { title: 'Upload risk assessment framework', description: 'Upload your risk assessment framework showing tools used, review frequencies, and governance links.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide environmental risk assessment', description: 'Upload environmental and operational risk assessments covering premises, staffing, and equipment.', category: 'EVIDENCE', priority: 'MEDIUM', defaultOwner: 'Maintenance Manager', defaultDueDays: 14 },
    { title: 'Document governance reporting on risk', description: 'Upload evidence of how senior management receives assurance that risk management is effective.', category: 'DOCUMENTATION', priority: 'MEDIUM', defaultOwner: 'Registered Manager', defaultDueDays: 21 },
  ],
  'premises-equipment': [
    { title: 'Upload maintenance schedule', description: 'Upload your planned and reactive maintenance schedule with responsible person and tracking system.', category: 'DOCUMENTATION', priority: 'HIGH', defaultOwner: 'Maintenance Manager', defaultDueDays: 7 },
    { title: 'Confirm statutory checks are current', description: 'Provide certificates for gas safety, electrical testing, fire risk assessment, and legionella.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'Maintenance Manager', defaultDueDays: 14 },
    { title: 'Provide equipment servicing records', description: 'Upload servicing records for care equipment (hoists, pressure mattresses, call systems).', category: 'EVIDENCE', priority: 'MEDIUM', defaultOwner: 'Maintenance Manager', defaultDueDays: 21 },
  ],
  'deprivation-of-liberty': [
    { title: 'Upload DoLS tracker', description: 'Upload your DoLS tracker showing all current authorisations, expiry dates, and conditions.', category: 'DOCUMENTATION', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Confirm MCA/DoLS training', description: 'Provide evidence that staff have completed Mental Capacity Act and DoLS training.', category: 'TRAINING', priority: 'HIGH', defaultOwner: 'Training Coordinator', defaultDueDays: 14 },
    { title: 'Upload example of conditions being met', description: 'Provide evidence showing how DoLS conditions are implemented for a current resident.', category: 'EVIDENCE', priority: 'MEDIUM', defaultOwner: 'Senior Carer', defaultDueDays: 14 },
  ],
  'person-centred-care': [
    { title: 'Upload example care plan', description: 'Upload a care plan showing personalised goals, person involvement, consent, and review dates.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'Senior Carer', defaultDueDays: 7 },
    { title: 'Provide feedback mechanisms evidence', description: 'Upload evidence of how residents and families provide feedback and how it leads to changes.', category: 'PROCESS', priority: 'MEDIUM', defaultOwner: 'Registered Manager', defaultDueDays: 14 },
    { title: 'Document care plan monitoring process', description: 'Upload evidence of how care plans are verified as being followed in practice.', category: 'DOCUMENTATION', priority: 'MEDIUM', defaultOwner: 'Quality Lead', defaultDueDays: 21 },
  ],
  'consent': [
    { title: 'Upload consent framework', description: 'Upload your consent policy covering capacity assessment, documentation, and review triggers.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide best interests decision example', description: 'Upload a recent best interests decision record showing process followed and parties consulted.', category: 'EVIDENCE', priority: 'MEDIUM', defaultOwner: 'Senior Carer', defaultDueDays: 14 },
    { title: 'Confirm consent audit results', description: 'Upload your most recent consent audit findings and actions taken.', category: 'EVIDENCE', priority: 'MEDIUM', defaultOwner: 'Quality Lead', defaultDueDays: 21 },
  ],
  'nutrition-hydration': [
    { title: 'Upload nutrition policy', description: 'Upload your nutrition and hydration policy covering assessment tools, monitoring, and dietary accommodation.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide MUST assessment evidence', description: 'Upload evidence of nutritional screening and assessment for at-risk residents.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'Clinical Lead', defaultDueDays: 14 },
    { title: 'Document fluid monitoring process', description: 'Upload evidence of fluid and food intake recording for high-risk residents.', category: 'DOCUMENTATION', priority: 'MEDIUM', defaultOwner: 'Senior Carer', defaultDueDays: 14 },
  ],
  'staffing': [
    { title: 'Upload staffing calculation tool', description: 'Upload your staffing dependency tool showing how levels are calculated and reviewed.', category: 'DOCUMENTATION', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide supervision and appraisal records', description: 'Upload evidence of supervision cycle completion and appraisal compliance.', category: 'EVIDENCE', priority: 'MEDIUM', defaultOwner: 'Registered Manager', defaultDueDays: 14 },
    { title: 'Upload training matrix', description: 'Provide your training matrix showing mandatory training compliance rates across all staff.', category: 'TRAINING', priority: 'MEDIUM', defaultOwner: 'Training Coordinator', defaultDueDays: 14 },
  ],
  'governance-leadership': [
    { title: 'Upload governance framework', description: 'Upload your quality assurance framework showing audit schedule, reporting lines, and escalation routes.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide quality assurance audit evidence', description: 'Upload evidence of your governance audit cycle including findings and sustained improvements.', category: 'EVIDENCE', priority: 'HIGH', defaultOwner: 'Quality Lead', defaultDueDays: 14 },
    { title: 'Document learning from incidents', description: 'Upload evidence showing how learning from incidents and complaints leads to sustained improvement.', category: 'DOCUMENTATION', priority: 'MEDIUM', defaultOwner: 'Registered Manager', defaultDueDays: 21 },
  ],
  'dignity-respect': [
    { title: 'Upload dignity and respect policy', description: 'Upload your policy on treating people with dignity and respect, with examples of embedding in practice.', category: 'POLICY', priority: 'HIGH', defaultOwner: 'Registered Manager', defaultDueDays: 7 },
    { title: 'Provide observation or audit evidence', description: 'Upload evidence of dignity observations or audits showing how practice is monitored.', category: 'EVIDENCE', priority: 'MEDIUM', defaultOwner: 'Quality Lead', defaultDueDays: 14 },
    { title: 'Document feedback mechanisms for dignity', description: 'Upload evidence of how feedback from residents on dignity is gathered and acted upon.', category: 'PROCESS', priority: 'MEDIUM', defaultOwner: 'Registered Manager', defaultDueDays: 21 },
  ],
};

// Maps document audit finding categories to action categories
function mapAuditCategoryToActionCategory(auditCategory: string): ActionRecord['category'] {
  const lower = auditCategory.toLowerCase();
  if (lower.includes('policy') || lower.includes('procedure')) return 'POLICY';
  if (lower.includes('training') || lower.includes('competenc')) return 'TRAINING';
  if (lower.includes('record') || lower.includes('document') || lower.includes('log')) return 'DOCUMENTATION';
  if (lower.includes('process') || lower.includes('governance') || lower.includes('audit')) return 'PROCESS';
  return 'EVIDENCE';
}

function mapAuditPriorityToActionPriority(correction: AuditCorrection): ActionRecord['priority'] {
  if (correction.priority === 'IMMEDIATE') return 'HIGH';
  if (correction.priority === 'THIS_WEEK') return 'MEDIUM';
  return 'LOW';
}

// SAF 34 regulation key mappings for topics (maps topic IDs to CQC regulation keys)
const SAF34_TOPIC_REGULATION_KEYS: Record<string, string[]> = {
  'safe-care-treatment': ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE', 'CQC:REG:SAFEGUARDING', 'CQC:REG:IPC', 'CQC:REG:MEDICINES', 'CQC:REG:PREMISES'],
  'staffing': ['CQC:REG:STAFFING', 'CQC:QS:SAFE', 'CQC:QS:EFFECTIVE', 'CQC:QS:WELL_LED'],
  'dignity-privacy': ['CQC:REG:DIGNITY', 'CQC:QS:CARING'],
  'person-centred-care': ['CQC:REG:PERSON_CENTRED', 'CQC:QS:CARING', 'CQC:QS:RESPONSIVE', 'CQC:QS:EFFECTIVE'],
  'governance': ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED', 'CQC:QS:EFFECTIVE'],
  'complaints-feedback': ['CQC:REG:COMPLAINTS', 'CQC:QS:RESPONSIVE'],
  'consent': ['CQC:REG:CONSENT', 'CQC:QS:EFFECTIVE'],
  'duty-of-candour': ['CQC:REG:DUTY_OF_CANDOUR', 'CQC:QS:RESPONSIVE'],
};

const DEFAULT_MAX_TOTAL_QUESTIONS = 10;

const SERVICE_TYPES = new Set([
  'residential',
  'nursing',
  'domiciliary',
  'supported_living',
  'hospice',
]);

const CQC_LOCATION_ID_PATTERN = /^1-[0-9]{7,13}$/;

function isValidCqcLocationId(id: string): boolean {
  return CQC_LOCATION_ID_PATTERN.test(id.trim());
}

const zQueryString = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.string().trim().min(1)
);
const zOptionalQueryString = zQueryString.optional();

const zId = z.string().trim().min(1);
const zProviderId = zId;
const zFacilityId = zId;
const zTopicId = zId;
const zSessionId = zId;
const zFindingId = zId;
const zExportId = zId;
const zJobId = zId;

const zBlobHash = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .refine(
    (value) =>
      /^sha256:[a-f0-9]{64}$/.test(value) || /^[a-f0-9]{64}$/.test(value),
    'Invalid blob hash'
  )
  .transform((value) => (value.startsWith('sha256:') ? value : `sha256:${value}`));

const zCqcLocationId = z
  .string()
  .trim()
  .regex(CQC_LOCATION_ID_PATTERN, 'Invalid CQC Location ID format (e.g., 1-123456789)');

const zServiceType = z
  .string()
  .trim()
  .refine((value) => SERVICE_TYPES.has(value), 'Invalid serviceType');

const zOptionalPositiveInt = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? undefined : value),
  z.coerce.number().int().nonnegative()
);

const zMimeType = z
  .string()
  .trim()
  .regex(/^[^/]+\/[^/]+$/, 'Invalid mimeType');

const zBase64 = z.string().min(1);

const zEvidenceType = z.nativeEnum(EvidenceType);

const zExportFormat = z.enum([
  'CSV',
  'PDF',
  'BLUE_OCEAN',
  'BLUE_OCEAN_BOARD',
  'BLUE_OCEAN_AUDIT',
  'INSPECTOR_PACK',
]);

type ExportFormat = 'CSV' | 'PDF' | 'BLUE_OCEAN' | 'BLUE_OCEAN_BOARD' | 'BLUE_OCEAN_AUDIT' | 'INSPECTOR_PACK';

function normalizeExportFormat(format: unknown): ExportFormat {
  if (format === 'CSV' || format === 'PDF') return format;
  if (format === 'INSPECTOR_PACK') return 'INSPECTOR_PACK';
  if (format === 'BLUE_OCEAN_AUDIT') return 'BLUE_OCEAN_AUDIT';
  if (format === 'BLUE_OCEAN_BOARD' || format === 'BLUE_OCEAN') return 'BLUE_OCEAN_BOARD';
  return 'PDF';
}

type OutputFormat = 'pdf' | 'docx' | 'csv' | 'md';

function getExportExtension(format: ExportFormat, outputFormat?: OutputFormat): string {
  if (outputFormat) return outputFormat;
  if (format === 'CSV') return 'csv';
  if (format === 'PDF') return 'pdf';
  return 'md'; // BLUE_OCEAN_*, INSPECTOR_PACK all use markdown (legacy default)
}

function resolveOutputFormat(format: ExportFormat, outputFormat?: string): OutputFormat {
  if (outputFormat === 'pdf' || outputFormat === 'docx' || outputFormat === 'csv' || outputFormat === 'md') {
    return outputFormat;
  }
  // Defaults per report type
  if (format === 'CSV') return 'csv';
  if (format === 'PDF') return 'pdf';
  return 'pdf'; // Blue Ocean and Inspector Pack default to PDF now
}

function getMimeType(outputFormat: OutputFormat): string {
  switch (outputFormat) {
    case 'pdf': return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'csv': return 'text/csv';
    case 'md': return 'text/markdown';
  }
}

function getBlueOceanFilename(exportId: string, format: ExportFormat): string {
  const suffix = format === 'BLUE_OCEAN_AUDIT' ? 'audit' : 'board';
  return `${exportId}.blue-ocean.${suffix}.md`;
}

function getContext(req: express.Request): TenantContext {
  return { tenantId: req.auth.tenantId, actorId: req.auth.actorId };
}

function buildFacilityContext(facility: { serviceType?: string; capacity?: number }, provider: { prsState?: string }): FacilityContext {
  return resolveFacilityContext({
    serviceType: facility.serviceType,
    prsState: provider.prsState as ProviderRegulatoryState | undefined,
    capacity: facility.capacity,
  }, TOPICS);
}

const QUEUE_NAME_VALUES: QueueName[] = Object.values(QUEUE_NAMES);

function resolveQueueNameFromJobId(jobId: string): QueueName | null {
  for (const name of QUEUE_NAME_VALUES) {
    if (jobId.startsWith(`${name}-`)) return name;
  }
  return null;
}

function mapQueueStateToStatus(state: string): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' {
  if (state === 'completed') return 'COMPLETED';
  if (state === 'failed') return 'FAILED';
  if (state === 'active') return 'PROCESSING';
  return 'PENDING';
}

type ValidationIssue = {
  path: string;
  message: string;
  code: string;
};

type ValidationSchemas = {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
};

function formatZodIssues(source: 'params' | 'query' | 'body', error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: [source, ...issue.path].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function sendValidationError(
  res: express.Response,
  issues: ValidationIssue[],
  metadataOverrides?: Partial<ReportContext>
): void {
  res.status(400).json({
    ...buildConstitutionalMetadata(metadataOverrides),
    error: 'VALIDATION_ERROR',
    message: 'Invalid request',
    issues,
  });
}

function validateRequest(
  req: express.Request,
  res: express.Response,
  schemas: ValidationSchemas,
  metadataOverrides?: Partial<ReportContext>
): { params: Record<string, unknown>; query: Record<string, unknown>; body: unknown } | null {
  const issues: ValidationIssue[] = [];
  let params: Record<string, unknown> = req.params ?? {};
  let query: Record<string, unknown> = req.query ?? {};
  let body: unknown = req.body;

  if (schemas.params) {
    const result = schemas.params.safeParse(req.params ?? {});
    if (!result.success) {
      issues.push(...formatZodIssues('params', result.error));
    } else {
      params = result.data as Record<string, unknown>;
    }
  }

  if (schemas.query) {
    const result = schemas.query.safeParse(req.query ?? {});
    if (!result.success) {
      issues.push(...formatZodIssues('query', result.error));
    } else {
      query = result.data as Record<string, unknown>;
    }
  }

  if (schemas.body) {
    const result = schemas.body.safeParse(req.body ?? {});
    if (!result.success) {
      issues.push(...formatZodIssues('body', result.error));
    } else {
      body = result.data;
    }
  }

  if (issues.length > 0) {
    sendValidationError(res, issues, metadataOverrides);
    return null;
  }

  return { params, query, body };
}

function sendWithMetadata(
  res: express.Response,
  payload: Record<string, unknown> | object,
  metadataOverrides?: Partial<ReportContext>
): void {
  res.json({ ...buildConstitutionalMetadata(metadataOverrides), ...payload });
}

function sendError(
  res: express.Response,
  status: number,
  message: string,
  metadataOverrides?: Partial<ReportContext>
): void {
  res.status(status).json({ ...buildConstitutionalMetadata(metadataOverrides), error: message });
}

function mapEvidenceRecord(record: EvidenceRecordRecord, documentAudit?: DocumentAuditSummary) {
  return {
    evidenceRecordId: record.id,
    providerId: record.providerId,
    facilityId: record.facilityId,
    blobHash: record.blobHash,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    evidenceType: record.evidenceType,
    fileName: record.fileName,
    description: record.description,
    uploadedAt: record.uploadedAt,
    ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    ...(documentAudit ? { documentAudit } : {}),
  };
}


function resolveMockContextFromSessions(sessions: MockSessionRecord[]): ReportContext {
  const latest = [...sessions].sort((a, b) => {
    const aTime = a.completedAt ?? a.createdAt;
    const bTime = b.completedAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  })[0];

  const asOf = latest?.completedAt ?? latest?.createdAt ?? new Date().toISOString();
  const reportSourceId = latest?.sessionId ?? 'mock:uninitialized';

  return {
    mode: 'MOCK',
    reportingDomain: ReportingDomain.MOCK_SIMULATION,
    reportSource: {
      type: 'mock',
      id: reportSourceId,
      asOf,
    },
    snapshotId: `snapshot:mock:${reportSourceId}`,
    snapshotTimestamp: asOf,
    ingestionStatus: latest
      ? (latest.status === 'COMPLETED' ? 'READY' : 'INGESTION_INCOMPLETE')
      : 'NO_SOURCE',
  };
}

async function resolveReportContextForFacility(
  ctx: TenantContext,
  providerId: string,
  facilityId: string
): Promise<ReportContext> {
  const evidence = await store.listEvidenceByFacility(ctx, facilityId);
  const cqcReports = evidence
    .filter((record) => record.evidenceType === EvidenceType.CQC_REPORT)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  if (cqcReports.length > 0) {
    const latest = cqcReports[0];
    const reportSource = {
      type: 'cqc_upload' as const,
      id: latest.id,
      asOf: latest.uploadedAt,
    };

    const regulatoryFindings = (await store.listFindingsByProvider(ctx, providerId))
      .filter((finding) => finding.facilityId === facilityId)
      .filter((finding) => finding.reportingDomain === ReportingDomain.REGULATORY_HISTORY);

    return {
      mode: 'REAL',
      reportingDomain: ReportingDomain.REGULATORY_HISTORY,
      reportSource,
      snapshotId: `snapshot:cqc:${latest.id}`,
      snapshotTimestamp: reportSource.asOf,
      ingestionStatus: regulatoryFindings.length > 0 ? 'READY' : 'INGESTION_INCOMPLETE',
    };
  }

  const sessions = (await store.listSessionsByProvider(ctx, providerId))
    .filter((session) => session.facilityId === facilityId);
  return resolveMockContextFromSessions(sessions);
}

function resolveReportContextForSession(session: MockSessionRecord): ReportContext {
  const asOf = session.completedAt ?? session.createdAt;
  return {
    mode: 'MOCK',
    reportingDomain: ReportingDomain.MOCK_SIMULATION,
    reportSource: {
      type: 'mock',
      id: session.sessionId,
      asOf,
    },
    snapshotId: `snapshot:mock:${session.sessionId}`,
    snapshotTimestamp: asOf,
    ingestionStatus: session.status === 'COMPLETED' ? 'READY' : 'INGESTION_INCOMPLETE',
  };
}

function resolveReportContextForFinding(finding: FindingRecord): ReportContext {
  const isRegulatory = finding.reportingDomain === ReportingDomain.REGULATORY_HISTORY;
  const reportSource = isRegulatory
    ? {
      type: 'cqc_upload' as const,
      id: finding.id,
      asOf: finding.createdAt,
    }
    : {
      type: 'mock' as const,
      id: finding.sessionId,
      asOf: finding.createdAt,
    };

  return {
    mode: isRegulatory ? 'REAL' : 'MOCK',
    reportingDomain: finding.reportingDomain,
    reportSource,
    snapshotId: `snapshot:${reportSource.type}:${reportSource.id}`,
    snapshotTimestamp: reportSource.asOf,
    ingestionStatus: 'READY',
  };
}


function buildDomainSession(session: {
  sessionId: string;
  tenantId: string;
  createdAt: string;
  completedAt?: string;
  maxFollowUps: number;
  providerId: string;
}, findings: DraftFinding[]): DomainSession {
  const basePayload = {
    id: session.sessionId,
    tenantId: session.tenantId,
    domain: Domain.CQC,
    contextSnapshotId: `snapshot-${session.sessionId}`,
    logicProfileId: 'prs-logic-v1',
    status: SessionStatus.COMPLETED,
    topicStates: new Map(),
    draftFindings: findings,
    events: [],
    totalQuestionsAsked: 1,
    totalFindingsDrafted: findings.length,
    maxFollowUpsPerTopic: session.maxFollowUps,
    maxTotalQuestions: DEFAULT_MAX_TOTAL_QUESTIONS,
    startedAt: session.createdAt,
    completedAt: session.completedAt ?? session.createdAt,
    createdBy: 'system',
  };

  const sessionHash = `sha256:${JSON.stringify(basePayload).length.toString(16).padStart(64, '0')}`;

  return {
    ...basePayload,
    sessionHash,
  };
}

/**
 * Generate action items for a finding from:
 * 1. Document audit findings (specific, evidence-based corrections from actual uploaded documents)
 * 2. Fallback templates (generic per-topic when no audit data exists)
 *
 * Document audit actions always come first (they're specific to what the provider actually uploaded).
 * Template actions fill remaining gaps.
 */
async function generateActionsForFinding(
  ctx: TenantContext,
  store: InMemoryStore,
  finding: FindingRecord,
  topicId: string,
  facilityId: string
): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];
  let sortOrder = 0;

  // 1. Pull document audit findings for this facility
  const auditResults = await listCompletedAuditsByFacility(ctx.tenantId, facilityId);
  const auditActions: Array<{ title: string; description: string; category: ActionRecord['category']; priority: ActionRecord['priority']; owner: string; dueDays: number }> = [];

  for (const audit of auditResults) {
    if (!audit.result) continue;
    // Create actions from corrections (they have specific actionable guidance + example wording)
    for (const correction of audit.result.corrections) {
      const desc = correction.exampleWording
        ? `${correction.correction}\n\nExample: ${correction.exampleWording}\n\nPolicy reference: ${correction.policyReference}`
        : `${correction.correction}\n\nPolicy reference: ${correction.policyReference}`;
      auditActions.push({
        title: correction.finding.length > 120 ? correction.finding.slice(0, 117) + '...' : correction.finding,
        description: desc,
        category: mapAuditCategoryToActionCategory(correction.policyReference),
        priority: mapAuditPriorityToActionPriority(correction),
        owner: 'Registered Manager',
        dueDays: correction.priority === 'IMMEDIATE' ? 3 : correction.priority === 'THIS_WEEK' ? 7 : 30,
      });
    }
  }

  // Create actions from document audit corrections (capped at 10 to avoid overwhelming)
  const cappedAuditActions = auditActions.slice(0, 10);
  for (const aa of cappedAuditActions) {
    try {
      const record = await store.addAction(ctx, {
        providerId: finding.providerId,
        facilityId,
        findingId: finding.id,
        topicId,
        domain: 'CQC',
        reportingDomain: 'MOCK_SIMULATION',
        title: aa.title,
        description: aa.description,
        category: aa.category,
        priority: aa.priority,
        assignedTo: aa.owner,
        targetCompletionDate: new Date(Date.now() + aa.dueDays * 86400_000).toISOString(),
        status: 'OPEN',
        verificationEvidenceIds: [],
        sortOrder: sortOrder++,
        createdBy: ctx.actorId,
        source: 'DOCUMENT_AUDIT',
      });
      actions.push(record);
    } catch (err) {
      console.error(`[ACTION_PLAN] Failed to create audit-derived action:`, err);
    }
  }

  // 2. Add template actions (always — they cover areas docs might not)
  const templates = ACTION_PLAN_TEMPLATES[topicId] ?? [];
  for (const template of templates) {
    try {
      const record = await store.addAction(ctx, {
        providerId: finding.providerId,
        facilityId,
        findingId: finding.id,
        topicId,
        domain: 'CQC',
        reportingDomain: 'MOCK_SIMULATION',
        title: template.title,
        description: template.description,
        category: template.category,
        priority: template.priority,
        assignedTo: template.defaultOwner,
        targetCompletionDate: new Date(Date.now() + template.defaultDueDays * 86400_000).toISOString(),
        status: 'OPEN',
        verificationEvidenceIds: [],
        sortOrder: sortOrder++,
        createdBy: ctx.actorId,
        source: 'TEMPLATE',
      });
      actions.push(record);
    } catch (err) {
      console.error(`[ACTION_PLAN] Failed to create template action:`, err);
    }
  }

  if (actions.length > 0) {
    await store.appendAuditEvent(ctx, finding.providerId, 'ACTION_PLAN_GENERATED', {
      findingId: finding.id,
      topicId,
      actionCount: actions.length,
      fromDocumentAudits: cappedAuditActions.length,
      fromTemplates: templates.length,
    });
  }

  return actions;
}

export function createApp(): { app: express.Express; store: InMemoryStore } {
  const app = express();

  // CORS configuration: production domains always allowed, plus env overrides
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST_MODE === 'true';

  // Production domains are always allowed
  const productionOrigins = [
    'https://regintelia.co.uk',
    'https://www.regintelia.co.uk',
  ];

  let allowedOrigins: string[];
  if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    // Merge env origins with production origins (deduplicated)
    allowedOrigins = [...new Set([...envOrigins, ...productionOrigins])];
  } else {
    // Default: production domains + localhost for development
    allowedOrigins = [
      ...productionOrigins,
      'http://localhost:3000',
      'http://localhost:3001',
    ];
    if (!isTestMode) {
      console.warn(
        '[CORS] ALLOWED_ORIGINS not set - using defaults (production + localhost). ' +
        'Set ALLOWED_ORIGINS to customize.'
      );
    }
  }
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
    })
  );

  // Rate limiting: Prevent DoS attacks and brute-force attempts
  // Disabled in test mode to allow E2E tests to run without throttling
  // Can also be disabled via DISABLE_RATE_LIMIT=true for local development
  // Note: isTestMode already defined above in CORS section
  const disableRateLimit = process.env.DISABLE_RATE_LIMIT === 'true';

  if (!disableRateLimit) {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: isTestMode ? 10000 : 100, // Higher limit for tests
      standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
      legacyHeaders: false, // Disable `X-RateLimit-*` headers
      message: 'Too many requests from this IP, please try again later.',
    });

    app.use(limiter);
  }

  app.get('/health', (_req, res) => {
    const isE2EMode = process.env.E2E_TEST_MODE === 'true';
    const hasCqcKey = !!process.env.CQC_API_KEY;
    const hasClerkKey = !!process.env.CLERK_SECRET_KEY;
    const hasTestToken = !!process.env.CLERK_TEST_TOKEN;
    const storeType = process.env.USE_DB_STORE !== 'false' ? 'prisma' : 'memory';

    const warnings: string[] = [];
    if (isE2EMode) warnings.push('auth_bypassed');
    if (hasTestToken) warnings.push('demo_tokens_active');
    if (!hasCqcKey) warnings.push('no_cqc_api_key');
    if (storeType === 'memory') warnings.push('in_memory_store');

    res.status(200).json({
      status: 'ok',
      config: {
        auth: isE2EMode ? 'bypassed' : hasClerkKey ? 'clerk' : 'legacy_tokens',
        store: storeType,
        cqcApi: hasCqcKey ? 'configured' : 'missing',
        nodeEnv: process.env.NODE_ENV || 'not_set',
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  });

  // Clerk webhook (MUST be before express.json() and authMiddleware)
  // Webhooks need raw body for signature verification
  app.post('/webhooks/clerk', express.json(), (req, res) => handleClerkWebhook(req, res, store));

  // Apply JSON parsing to all other routes
  app.use(express.json({ limit: '10mb' }));

  app.use('/v1', authMiddleware);

  /**
   * GET /v1/cqc/locations/:locationId
   *
   * Lightweight CQC API lookup — fetches location data without creating a facility.
   * Used by the "Fetch from CQC" button to auto-populate the onboarding form.
   */
  app.get('/v1/cqc/locations/:locationId', async (req, res) => {
    const parsed = validateRequest(req, res, {
      params: z.object({ locationId: zCqcLocationId }).strip(),
    });
    if (!parsed) return;
    const { locationId } = parsed.params as { locationId: string };

    try {
      const result = await fetchCqcLocation(locationId, {
        apiKey: process.env.CQC_API_KEY,
      });

      if (result.success) {
        sendWithMetadata(res, {
          found: true,
          data: result.data,
        });
      } else {
        sendWithMetadata(res, {
          found: false,
          error: result.error,
        });
      }
    } catch (error) {
      sendError(res, 500, 'Failed to fetch CQC data');
    }
  });

  app.get('/v1/providers', async (req, res) => {
    const ctx = getContext(req);
    const providers = await store.listProviders(ctx);
    sendWithMetadata(res, { providers });
  });

  app.post('/v1/providers', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      body: z
        .object({
          providerName: z.string().trim().min(1),
          orgRef: z.string().trim().optional(),
        })
        .strip(),
    });
    if (!parsed) return;
    const { providerName, orgRef } = parsed.body as { providerName: string; orgRef?: string };

    const provider = await store.createProvider(ctx, { providerName: providerName.trim(), orgRef });
    await store.appendAuditEvent(ctx, provider.providerId, 'PROVIDER_CREATED', { providerId: provider.providerId, providerName: provider.providerName });
    sendWithMetadata(res, { provider });
  });

  app.get('/v1/providers/:providerId/overview', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility: string };

    const provider = await store.getProviderById(ctx, providerId);
    const facility = await store.getFacilityById(ctx, facilityId);

    if (!provider || !facility || facility.providerId !== providerId) {
      sendError(res, 404, 'Provider or facility not found');
      return;
    }

    const fCtx = buildFacilityContext(facility, provider);
    const facilityEvidence = await store.listEvidenceByFacility(ctx, facilityId);
    const hasCqcReport = facilityEvidence.some((record) => record.evidenceType === EvidenceType.CQC_REPORT);
    const evidenceCount = facilityEvidence.length;
    const totalExpectedDocuments = fCtx.expectedEvidenceCount;
    const documentUploadPercentage = totalExpectedDocuments > 0
      ? Math.min(100, Math.round((evidenceCount / totalExpectedDocuments) * 100))
      : evidenceCount > 0 ? 100 : 0;

    // Evidence coverage: count how many required evidence types are satisfied (not raw upload count)
    const uploadedTypes = new Set(facilityEvidence.map(e => e.evidenceType));
    const matchedTypes = fCtx.requiredEvidenceTypes.filter(t => uploadedTypes.has(t));
    const evidenceCoverage = fCtx.requiredEvidenceTypes.length > 0
      ? Math.min(100, Math.round((matchedTypes.length / fCtx.requiredEvidenceTypes.length) * 100))
      : evidenceCount > 0 ? 100 : 0;

    const baseReportContext = await resolveReportContextForFacility(ctx, providerId, facilityId);
    const reportContext = hasCqcReport
      ? { ...baseReportContext, ingestionStatus: 'READY' as const }
      : baseReportContext;

    let topicsCompleted = 0;
    let unansweredQuestions = 0;
    let openFindings = 0;

    if (reportContext.mode === 'MOCK') {
      const sessions = (await store.listSessionsByProvider(ctx, providerId))
        .filter((session) => session.facilityId === facilityId);
      const completedSessions = sessions.filter((session) => session.status === 'COMPLETED');
      topicsCompleted = completedSessions.length;
      unansweredQuestions = sessions.filter((session) => session.status === 'IN_PROGRESS').length;
      openFindings = (await store.listFindingsByProvider(ctx, providerId))
        .filter((finding) => finding.facilityId === facilityId).length;
    } else {
      openFindings = (await store.listFindingsByProvider(ctx, providerId))
        .filter((finding) => finding.facilityId === facilityId)
        .filter((finding) => finding.reportingDomain === ReportingDomain.REGULATORY_HISTORY).length;
    }

    sendWithMetadata(res, {
      provider,
      facility,
      evidenceCoverage,
      evidenceCount,
      documentUploadPercentage,
      topicsCompleted,
      totalTopics: fCtx.applicableTopicCount,
      unansweredQuestions,
      openFindings,
      requiredEvidenceTypes: fCtx.requiredEvidenceTypes,
      readinessWeights: fCtx.readinessWeights,
    }, reportContext);
  });

  /**
   * GET /v1/providers/:providerId/dashboard
   *
   * Provider-level compliance command centre.
   * Aggregates readiness data across all facilities.
   */
  app.get('/v1/providers/:providerId/dashboard', asyncRoute(async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };

    const provider = await store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }

    const facilities = await store.listFacilitiesByProvider(ctx, providerId);
    const allFindings = await store.listFindingsByProvider(ctx, providerId);
    const allSessions = await store.listSessionsByProvider(ctx, providerId);
    const facilitySummaries = await Promise.all(facilities.map(async (facility) => {
      const fCtx = buildFacilityContext(facility, provider);
      const evidence = await store.listEvidenceByFacility(ctx, facility.id);
      const facilityFindings = allFindings.filter(f => f.facilityId === facility.id);
      const facilitySessions = allSessions.filter(s => s.facilityId === facility.id);
      const completedSessions = facilitySessions.filter(s => s.status === 'COMPLETED');

      const evidenceCount = evidence.length;
      const uploadedTypes = new Set(evidence.map(e => e.evidenceType));
      const matchedTypes = fCtx.requiredEvidenceTypes.filter(t => uploadedTypes.has(t));
      const evidenceCoverage = fCtx.requiredEvidenceTypes.length > 0
        ? Math.min(100, Math.round((matchedTypes.length / fCtx.requiredEvidenceTypes.length) * 100))
        : evidenceCount > 0 ? 100 : 0;

      const findingsBySeverity = {
        critical: facilityFindings.filter(f => f.severity === 'CRITICAL').length,
        high: facilityFindings.filter(f => f.severity === 'HIGH').length,
        medium: facilityFindings.filter(f => f.severity === 'MEDIUM').length,
        low: facilityFindings.filter(f => f.severity === 'LOW').length,
      };

      const lastEvidenceUpload = evidence.length > 0
        ? evidence.reduce((latest, e) => e.uploadedAt > latest ? e.uploadedAt : latest, evidence[0].uploadedAt)
        : null;

      const lastMockSession = completedSessions.length > 0
        ? completedSessions.reduce((latest, s) => {
            const d = s.completedAt ?? s.createdAt;
            return d > latest ? d : latest;
          }, completedSessions[0].completedAt ?? completedSessions[0].createdAt)
        : null;

      // Readiness score: weighted combination of evidence coverage and mock completion
      const mockCoverage = fCtx.applicableTopicCount > 0
        ? Math.round((completedSessions.length / fCtx.applicableTopicCount) * 100)
        : 0;
      const readinessScore = Math.round(
        evidenceCoverage * fCtx.readinessWeights.evidence +
        mockCoverage * fCtx.readinessWeights.mockCoverage
      );

      const attentionReasons: string[] = [];
      if (findingsBySeverity.critical > 0) attentionReasons.push('Has critical findings');
      if (lastEvidenceUpload) {
        const daysSinceUpload = Math.floor((Date.now() - new Date(lastEvidenceUpload).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceUpload > fCtx.attentionThresholdDays) attentionReasons.push(`No evidence uploads in ${daysSinceUpload} days`);
      } else {
        attentionReasons.push('No evidence uploaded');
      }
      const inProgressSessions = facilitySessions.filter(s => s.status === 'IN_PROGRESS');
      if (inProgressSessions.length > 0) attentionReasons.push('Incomplete practice inspections');

      return {
        facilityId: facility.id,
        facilityName: facility.facilityName,
        serviceType: facility.serviceType,
        capacity: facility.capacity,
        readinessScore,
        evidenceCoverage,
        evidenceCount,
        applicableTopicCount: fCtx.applicableTopicCount,
        requiredEvidenceTypes: fCtx.requiredEvidenceTypes,
        readinessColorThresholds: fCtx.readinessColorThresholds,
        findingsBySeverity,
        lastEvidenceUploadDate: lastEvidenceUpload,
        lastMockSessionDate: lastMockSession,
        completedMockSessions: completedSessions.length,
        needsAttention: attentionReasons.length > 0,
        attentionReasons,
      };
    }));

    // Sort worst-first
    facilitySummaries.sort((a, b) => a.readinessScore - b.readinessScore);

    const totalFindings = {
      critical: facilitySummaries.reduce((sum, f) => sum + f.findingsBySeverity.critical, 0),
      high: facilitySummaries.reduce((sum, f) => sum + f.findingsBySeverity.high, 0),
      medium: facilitySummaries.reduce((sum, f) => sum + f.findingsBySeverity.medium, 0),
      low: facilitySummaries.reduce((sum, f) => sum + f.findingsBySeverity.low, 0),
    };

    // Capacity-weighted average readiness
    const totalCapacity = facilitySummaries.reduce((s, f) => s + (f.capacity ?? 1), 0);
    const averageReadiness = facilitySummaries.length > 0
      ? Math.round(facilitySummaries.reduce((sum, f) => sum + f.readinessScore * (f.capacity ?? 1), 0) / totalCapacity)
      : 0;

    // Collect expiring evidence across all facilities
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expiringEvidence: Array<{
      evidenceRecordId: string;
      facilityId: string;
      facilityName: string;
      fileName: string;
      evidenceType: string;
      expiresAt: string;
      daysUntilExpiry: number;
      isOverdue: boolean;
    }> = [];

    for (const facility of facilities) {
      const evidence = await store.listEvidenceByFacility(ctx, facility.id);
      for (const record of evidence) {
        if (record.expiresAt) {
          const expiresTime = new Date(record.expiresAt).getTime();
          const daysUntilExpiry = Math.ceil((expiresTime - now) / (1000 * 60 * 60 * 24));
          if (daysUntilExpiry <= 30) {
            expiringEvidence.push({
              evidenceRecordId: record.id,
              facilityId: facility.id,
              facilityName: facility.facilityName,
              fileName: record.fileName,
              evidenceType: record.evidenceType,
              expiresAt: record.expiresAt,
              daysUntilExpiry,
              isOverdue: daysUntilExpiry < 0,
            });
          }
        }
      }
    }
    expiringEvidence.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    sendWithMetadata(res, {
      providerId: provider.providerId,
      providerName: provider.providerName,
      facilities: facilitySummaries,
      totals: {
        facilities: facilitySummaries.length,
        averageReadiness,
        totalFindings,
        facilitiesNeedingAttention: facilitySummaries.filter(f => f.needsAttention).length,
      },
      expiringEvidence,
    });
  }));

  /**
   * GET /v1/providers/:providerId/expiring-evidence
   *
   * Returns evidence expiring within N days across all facilities.
   */
  app.get('/v1/providers/:providerId/expiring-evidence', asyncRoute(async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ days: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const daysParam = parsed.query.days as string | undefined;
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    const provider = await store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }

    const facilities = await store.listFacilitiesByProvider(ctx, providerId);
    const now = Date.now();
    const items: Array<{
      evidenceRecordId: string;
      facilityId: string;
      facilityName: string;
      fileName: string;
      evidenceType: string;
      expiresAt: string;
      daysUntilExpiry: number;
      isOverdue: boolean;
    }> = [];

    for (const facility of facilities) {
      const evidence = await store.listEvidenceByFacility(ctx, facility.id);
      for (const record of evidence) {
        if (record.expiresAt) {
          const expiresTime = new Date(record.expiresAt).getTime();
          const daysUntilExpiry = Math.ceil((expiresTime - now) / (1000 * 60 * 60 * 24));
          if (daysUntilExpiry <= days) {
            items.push({
              evidenceRecordId: record.id,
              facilityId: facility.id,
              facilityName: facility.facilityName,
              fileName: record.fileName,
              evidenceType: record.evidenceType,
              expiresAt: record.expiresAt,
              daysUntilExpiry,
              isOverdue: daysUntilExpiry < 0,
            });
          }
        }
      }
    }

    items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    sendWithMetadata(res, { items, totalCount: items.length });
  }));

  /**
   * GET /v1/facilities/:facilityId/readiness-journey
   *
   * Returns the guided readiness checklist for a facility.
   * All steps are derived from existing data — nothing stored.
   */
  app.get('/v1/facilities/:facilityId/readiness-journey', asyncRoute(async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };

    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    const provider = await store.getProviderById(ctx, facility.providerId);
    const evidence = await store.listEvidenceByFacility(ctx, facilityId);
    const sessions = (await store.listSessionsByProvider(ctx, facility.providerId))
      .filter(s => s.facilityId === facilityId);
    const findings = (await store.listFindingsByProvider(ctx, facility.providerId))
      .filter(f => f.facilityId === facilityId);
    const exports = (await store.listExportsByProvider(ctx, facility.providerId, facilityId));

    // Collect audit summaries for document audit step
    const evidenceIds = evidence.map(e => e.id);
    const auditSummaries = await listDocumentAuditSummariesByEvidenceRecordIds(ctx.tenantId, evidenceIds);
    const completedAudits = Array.from(auditSummaries.values()).filter(a => a.status === 'COMPLETED');

    const hasCqcReport = evidence.some(e => e.evidenceType === EvidenceType.CQC_REPORT);
    const completedSessions = sessions.filter(s => s.status === 'COMPLETED');
    const criticalFindings = findings.filter(f => f.severity === 'CRITICAL');
    const fCtx = buildFacilityContext(facility, provider ?? {});
    const totalExpectedDocuments = fCtx.expectedEvidenceCount;
    const detailUploadedTypes = new Set(evidence.map(e => e.evidenceType));
    const detailMatchedTypes = fCtx.requiredEvidenceTypes.filter(t => detailUploadedTypes.has(t));
    const evidenceCoverage = fCtx.requiredEvidenceTypes.length > 0
      ? Math.min(100, Math.round((detailMatchedTypes.length / fCtx.requiredEvidenceTypes.length) * 100))
      : evidence.length > 0 ? 100 : 0;
    const hasBlueOcean = exports.some(e => e.format === 'BLUE_OCEAN_BOARD' || e.format === 'BLUE_OCEAN_AUDIT');

    const providerId = facility.providerId;
    const facilityQuery = `provider=${encodeURIComponent(providerId)}&facility=${encodeURIComponent(facilityId)}`;

    const steps = [
      {
        id: 'registered',
        label: 'Location registered',
        description: 'Location has been added to the system',
        status: 'complete' as const,
        guidance: 'Your location is registered and ready for evidence collection.',
      },
      {
        id: 'cqc-synced',
        label: 'CQC report synced',
        description: 'Latest CQC inspection report has been imported',
        status: hasCqcReport ? 'complete' as const : 'not-started' as const,
        actionLabel: hasCqcReport ? undefined : 'Sync CQC Report',
        actionHref: hasCqcReport ? undefined : `/facilities/${encodeURIComponent(facilityId)}?${facilityQuery}`,
        guidance: 'Syncing your latest CQC report allows the system to identify existing compliance gaps and track improvements over time.',
      },
      {
        id: 'first-evidence',
        label: 'First evidence uploaded',
        description: 'At least one policy, training record, or audit has been uploaded',
        status: evidence.length > 0 ? 'complete' as const : 'not-started' as const,
        actionLabel: evidence.length > 0 ? undefined : 'Upload Evidence',
        actionHref: evidence.length > 0 ? undefined : `/facilities/${encodeURIComponent(facilityId)}?${facilityQuery}`,
        guidance: 'Start with your highest-risk area. Uploading a policy document covers W1 (Shared direction) and W4 (Governance) — two of the eight Well-Led Quality Statements.',
      },
      {
        id: 'evidence-critical-mass',
        label: '3+ evidence documents uploaded',
        description: 'Enough evidence for meaningful AI audit analysis',
        status: evidence.length >= 3 ? 'complete' as const : evidence.length > 0 ? 'in-progress' as const : 'not-started' as const,
        actionLabel: evidence.length < 3 ? 'Upload More Evidence' : undefined,
        actionHref: evidence.length < 3 ? `/facilities/${encodeURIComponent(facilityId)}?${facilityQuery}` : undefined,
        guidance: 'Three documents gives the AI enough context to cross-reference and identify patterns. Prioritise one from each area: a policy (Well-Led), a training record (Safe staffing), and a clinical document like a care plan (Effective).',
      },
      {
        id: 'first-audit',
        label: 'First document audit complete',
        description: 'AI has reviewed at least one uploaded document',
        status: completedAudits.length > 0 ? 'complete' as const : evidence.length > 0 ? 'in-progress' as const : 'not-started' as const,
        guidance: 'Document audits map your evidence to SAF Quality Statements automatically. A completed audit for a care plan will assess E1 (Assessing needs), E6 (Consent), and R1 (Person-centred care).',
      },
      {
        id: 'first-mock',
        label: 'First practice inspection completed',
        description: 'A mock inspection session has been completed for this location',
        status: completedSessions.length > 0 ? 'complete' as const : sessions.length > 0 ? 'in-progress' as const : 'not-started' as const,
        actionLabel: completedSessions.length === 0 ? 'Start Practice Inspection' : undefined,
        actionHref: completedSessions.length === 0 ? `/mock-session?${facilityQuery}` : undefined,
        guidance: 'A practice inspection simulates CQC questioning across your key risk areas and generates findings with regulatory references.',
      },
      {
        id: 'critical-addressed',
        label: 'All critical findings addressed',
        description: 'No unresolved critical-severity findings remain',
        status: criticalFindings.length === 0 && completedSessions.length > 0
          ? 'complete' as const
          : criticalFindings.length > 0 ? 'in-progress' as const : 'not-started' as const,
        actionLabel: criticalFindings.length > 0 ? 'View Findings' : undefined,
        actionHref: criticalFindings.length > 0 ? `/findings?${facilityQuery}` : undefined,
        guidance: 'Critical findings indicate immediate risk to people using the service. Addressing these first demonstrates a responsive safety culture (S1 Learning culture).',
      },
      {
        id: 'coverage-50',
        label: 'Evidence coverage reaches 50%',
        description: 'Half of required evidence types have been uploaded',
        status: evidenceCoverage >= 50 ? 'complete' as const : evidenceCoverage > 0 ? 'in-progress' as const : 'not-started' as const,
        guidance: 'At 50% coverage, you likely have gaps in Safe and Effective domains. Prioritise: MAR charts (S8 Medicines), risk assessments (S4 Involving people in risks), and training matrices (S6 Safe staffing).',
      },
      {
        id: 'coverage-80',
        label: 'Evidence coverage reaches 80%',
        description: 'Strong evidence base — approaching inspection readiness',
        status: evidenceCoverage >= 80 ? 'complete' as const : evidenceCoverage >= 50 ? 'in-progress' as const : 'not-started' as const,
        guidance: 'At 80% coverage, focus on the remaining Quality Statements. Check your Inspector Evidence Pack to see which specific statements still lack evidence.',
      },
      {
        id: 'blue-ocean',
        label: 'Blue Ocean report generated',
        description: 'Full analyst-grade compliance report has been produced',
        status: hasBlueOcean ? 'complete' as const : completedSessions.length > 0 ? 'not-started' as const : 'not-started' as const,
        actionLabel: !hasBlueOcean && completedSessions.length > 0 ? 'Generate Report' : undefined,
        actionHref: !hasBlueOcean && completedSessions.length > 0 ? `/exports?${facilityQuery}` : undefined,
        guidance: 'The Blue Ocean report provides a PhD-level analysis including root cause analysis, SMART actions, and regulatory mapping across all 34 Quality Statements.',
      },
    ];

    const completedCount = steps.filter(s => s.status === 'complete').length;
    const progressPercent = Math.round((completedCount / steps.length) * 100);

    // Find next recommended action
    const nextStep = steps.find(s => s.status !== 'complete' && s.actionLabel);
    const nextRecommendedAction = nextStep ? {
      label: nextStep.actionLabel!,
      href: nextStep.actionHref!,
      reason: nextStep.description,
    } : undefined;

    sendWithMetadata(res, {
      facilityId: facility.id,
      facilityName: facility.facilityName,
      steps,
      completedCount,
      totalCount: steps.length,
      progressPercent,
      nextRecommendedAction,
    });
  }));

  app.get('/v1/providers/:providerId/topics', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };

    const provider = await store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }

    const reportContext = facilityId
      ? await resolveReportContextForFacility(ctx, providerId, facilityId)
      : undefined;

    // Filter topics by facility service type when facilityId provided
    const facility = facilityId ? await store.getFacilityById(ctx, facilityId) : null;
    const fCtx = buildFacilityContext(facility ?? {}, provider);
    const filteredTopics = TOPICS.filter(t => fCtx.applicableTopicIds.includes(t.id));

    let completionStatus = filteredTopics.reduce<Record<string, { completed: number; total: number }>>(
      (acc, topic) => {
        acc[topic.id] = { completed: 0, total: 1 };
        return acc;
      },
      {}
    );

    if (!reportContext || reportContext.mode === 'MOCK') {
      const sessions = (await store.listSessionsByProvider(ctx, providerId))
        .filter((session) => !facilityId || session.facilityId === facilityId);
      completionStatus = filteredTopics.reduce<Record<string, { completed: number; total: number }>>(
        (acc, topic) => {
          const completed = sessions.filter(
            (session) => session.topicId === topic.id && session.status === 'COMPLETED'
          ).length;
          acc[topic.id] = { completed, total: 1 };
          return acc;
        },
        {}
      );
    }

    sendWithMetadata(res, { topics: filteredTopics, completionStatus }, reportContext);
  });

  app.get('/v1/providers/:providerId/topics/:topicId', async (req, res) => {
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, topicId: zTopicId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { topicId, providerId } = parsed.params as { topicId: string; providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };
    const topic = TOPICS.find((item) => item.id === topicId);
    if (!topic) {
      sendError(res, 404, 'Topic not found');
      return;
    }
    const ctx = getContext(req);
    const reportContext = facilityId
      ? await resolveReportContextForFacility(ctx, providerId, facilityId)
      : undefined;
    sendWithMetadata(res, topic, reportContext);
  });

  app.get('/v1/providers/:providerId/mock-sessions', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };

    const sessions = (await store.listSessionsByProvider(ctx, providerId))
      .filter((session) => !facilityId || session.facilityId === facilityId);
    const reportContext = resolveMockContextFromSessions(sessions);
    sendWithMetadata(res, { sessions }, reportContext);
  });

  app.post('/v1/providers/:providerId/mock-sessions', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      body: z.object({ topicId: zTopicId, facilityId: zFacilityId }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { topicId, facilityId } = parsed.body as { topicId: string; facilityId: string };

    const provider = await store.getProviderById(ctx, providerId);
    const facility = await store.getFacilityById(ctx, facilityId);
    if (!provider || !facility || facility.providerId !== providerId) {
      sendError(res, 404, 'Provider or facility not found');
      return;
    }

    const topic = TOPICS.find((item) => item.id === topicId);
    if (!topic) {
      sendError(res, 400, 'Invalid topicId');
      return;
    }

    const fCtx = buildFacilityContext(facility, provider);
    const metadata = buildConstitutionalMetadata();
    const firstQuestion = selectQuestion(topicId, 0);
    const session = await store.createMockSession(ctx, {
      provider,
      facilityId,
      topicId,
      maxFollowUps: fCtx.maxFollowUpsPerTopic,
      topicCatalogVersion: metadata.topicCatalogVersion,
      topicCatalogHash: metadata.topicCatalogHash,
      prsLogicProfilesVersion: metadata.prsLogicVersion,
      prsLogicProfilesHash: metadata.prsLogicHash,
      initialQuestion: firstQuestion,
    });

    await store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_STARTED', {
      sessionId: session.sessionId,
      facilityId,
      topicId,
    });

    const reportContext = resolveReportContextForSession(session);
    sendWithMetadata(res, session, reportContext);
  });

  app.get('/v1/providers/:providerId/mock-sessions/:sessionId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, sessionId: zSessionId }).strip(),
    });
    if (!parsed) return;
    const { providerId, sessionId } = parsed.params as { providerId: string; sessionId: string };
    const session = await store.getSessionById(ctx, sessionId);

    if (!session || session.providerId !== providerId) {
      sendError(res, 404, 'Session not found');
      return;
    }

    const reportContext = resolveReportContextForSession(session);
    sendWithMetadata(res, session, reportContext);
  });

  app.post('/v1/providers/:providerId/mock-sessions/:sessionId/answer', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, sessionId: zSessionId }).strip(),
      body: z.object({ answer: z.string().trim().min(1) }).strip(),
    });
    if (!parsed) return;
    const { providerId, sessionId } = parsed.params as { providerId: string; sessionId: string };
    const { answer } = parsed.body as { answer: string };

    const session = await store.getSessionById(ctx, sessionId);
    if (!session || session.providerId !== providerId) {
      sendError(res, 404, 'Session not found');
      return;
    }

    if (session.status !== 'IN_PROGRESS') {
      sendError(res, 409, 'Session already completed');
      return;
    }

    const topic = TOPICS.find((item) => item.id === session.topicId);
    const facility = await store.getFacilityById(ctx, session.facilityId);
    const provider = await store.getProviderById(ctx, providerId);
    const fCtx = buildFacilityContext(facility ?? {}, provider ?? {});

    const newFollowUpsUsed = session.followUpsUsed + 1;
    const newHistory = [
      ...session.conversationHistory,
      { role: 'assistant' as const, content: session.currentQuestion },
      { role: 'user' as const, content: answer },
    ];

    await store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_ANSWERED', {
      sessionId,
      questionNumber: newFollowUpsUsed,
      answerLength: answer.length,
    });

    if (newFollowUpsUsed < session.maxFollowUps) {
      // More questions remain — advance to next question, stay IN_PROGRESS
      const nextQuestion = selectQuestion(session.topicId, newFollowUpsUsed);
      const updated: typeof session = {
        ...session,
        followUpsUsed: newFollowUpsUsed,
        currentQuestion: nextQuestion,
        conversationHistory: newHistory,
      };
      await store.updateSession(ctx, updated);
      const reportContext = resolveReportContextForSession(updated);
      sendWithMetadata(res, updated, reportContext);
      return;
    }

    // Final answer — complete session
    const completedAt = new Date().toISOString();
    const updated: typeof session = {
      ...session,
      followUpsUsed: newFollowUpsUsed,
      conversationHistory: newHistory,
      status: 'COMPLETED',
      completedAt,
    };
    await store.updateSession(ctx, updated);

    const evidenceRequired = topic?.evidenceRequirements ?? [];
    const facilityEvidence = await store.listEvidenceByFacility(ctx, session.facilityId);
    const evidenceProvided = facilityEvidence.map((record) => record.evidenceType);
    const evidenceMissing = evidenceRequired.filter(
      (required) => !evidenceProvided.includes(required)
    );

    const impactScore = 80;
    const likelihoodScore = 90;
    const adjusted = computeAdjustedSeverityScore(impactScore, likelihoodScore, fCtx.severityMultiplier);

    // Build description from full conversation
    const conversationSummary = newHistory
      .map((turn, i) => {
        const label = turn.role === 'assistant' ? `Q${Math.floor(i / 2) + 1}` : `A${Math.floor(i / 2) + 1}`;
        return `${label}: ${turn.content.slice(0, 300)}${turn.content.length > 300 ? '...' : ''}`;
      })
      .join('\n');

    const finding = await store.addFinding(ctx, {
      providerId,
      facilityId: session.facilityId,
      sessionId,
      regulationSectionId: topic?.regulationSectionId ?? 'Reg 12(2)(a)',
      topicId: session.topicId,
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'HIGH',
      impactScore: adjusted.adjustedImpact,
      likelihoodScore: adjusted.adjustedLikelihood,
      compositeRiskScore: adjusted.composite,
      title: `Mock inspection finding: ${topic?.title ?? 'Mock inspection'} (${topic?.regulationSectionId ?? 'Reg 12(2)(a)'})`,
      description: `Mock inspection of ${topic?.title ?? 'this topic'} under ${topic?.regulationSectionId ?? 'Reg 12(2)(a)'}. Full session transcript:\n\n${conversationSummary}`,
      evidenceRequired,
      evidenceProvided,
      evidenceMissing,
    });

    await store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_COMPLETED', {
      sessionId,
      findingId: finding.id,
      questionsAsked: newFollowUpsUsed,
    });

    // Auto-generate action plan from templates + document audit findings
    try {
      await generateActionsForFinding(ctx, store, finding, session.topicId, session.facilityId);
    } catch (err) {
      console.error(`[ACTION_PLAN] Failed to generate actions for finding ${finding.id}:`, err);
    }

    if (process.env.ENABLE_AI_INSIGHTS !== 'false') {
      try {
        const job = await aiInsightQueue.add({
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          sessionId,
          providerId,
          facilityId: session.facilityId,
          topicId: session.topicId,
          topicTitle: topic?.title,
          regulationSectionId: topic?.regulationSectionId,
          question: session.currentQuestion,
          answer,
          serviceType: facility?.serviceType,
        } as AIInsightJobData);

        setBounded(mockInsightJobs, sessionId, job.id);
      } catch (error) {
        console.error('[AI_INSIGHTS] Failed to enqueue job:', error);
      }
    }

    const reportContext = resolveReportContextForSession(updated);
    sendWithMetadata(res, { ...updated, findingId: finding.id }, reportContext);
  });

  /**
   * GET /v1/providers/:providerId/mock-sessions/:sessionId/ai-insights
   *
   * Fetch advisory AI insights for a mock session (if available).
   */
  app.get('/v1/providers/:providerId/mock-sessions/:sessionId/ai-insights', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, sessionId: zSessionId }).strip(),
    });
    if (!parsed) return;
    const { providerId, sessionId } = parsed.params as { providerId: string; sessionId: string };

    const session = await store.getSessionById(ctx, sessionId);
    if (!session || session.providerId !== providerId) {
      sendError(res, 404, 'Session not found');
      return;
    }

    const jobId = mockInsightJobs.get(sessionId);
    if (!jobId) {
      sendError(res, 404, 'AI insights not available');
      return;
    }

    try {
      const job = await aiInsightQueue.getJob(jobId);
      if (!job) {
        sendError(res, 404, 'AI insight job not found');
        return;
      }

      if (job.state === 'completed' && job.result) {
        const result = job.result as AIInsightJobResult;

        sendWithMetadata(res, {
          sessionId,
          insights: result.insights,
          recommendations: result.recommendations,
          status: 'COMPLETED',
          jobId,
        });
        return;
      }

      sendWithMetadata(res, {
        sessionId,
        insights: [],
        recommendations: [],
        status: mapQueueStateToStatus(job.state),
        jobId,
        error: job.error,
      });
    } catch (error) {
      console.error('[AI_INSIGHTS] Failed:', error);
      sendError(res, 500, 'Failed to fetch AI insights');
    }
  });

  // ── Old action plan endpoints removed — see new endpoints below findings ──

  // ── SAF 34 Quality Statement Coverage ──────────────────────────
  app.get('/v1/providers/:providerId/saf34-coverage', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility: string };

    const provider = await store.getProviderById(ctx, providerId);
    const facility = await store.getFacilityById(ctx, facilityId);

    if (!provider || !facility || facility.providerId !== providerId) {
      sendError(res, 404, 'Provider or facility not found');
      return;
    }

    // Filter topics by facility service type, then build regulation keys for coverage
    const fCtx = buildFacilityContext(facility, provider);
    const applicableSet = new Set(fCtx.applicableTopicIds);
    const topicsForCoverage = TOPICS
      .filter(t => applicableSet.has(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        regulationSectionId: t.regulationSectionId,
        regulationKeys: SAF34_TOPIC_REGULATION_KEYS[t.id] || [],
      }));

    const coverage = getQualityStatementCoverage(topicsForCoverage);

    const reportContext = await resolveReportContextForFacility(ctx, providerId, facilityId);

    sendWithMetadata(res, {
      statements: coverage.statements.map((s) => ({
        id: s.qualityStatement.id,
        keyQuestion: s.qualityStatement.keyQuestion,
        title: s.qualityStatement.title,
        covered: s.covered,
        matchingTopicIds: s.matchingTopicIds,
      })),
      keyQuestions: coverage.keyQuestions,
      overall: coverage.overall,
    }, reportContext);
  });

  app.get('/v1/providers/:providerId/findings', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };

    const reportContext = facilityId
      ? await resolveReportContextForFacility(ctx, providerId, facilityId)
      : undefined;

    let findings = (await store.listFindingsByProvider(ctx, providerId))
      .filter((finding) => !facilityId || finding.facilityId === facilityId);

    if (reportContext?.mode === 'REAL') {
      findings = findings.filter(
        (finding) => finding.reportingDomain === ReportingDomain.REGULATORY_HISTORY
      );
    }

    sendWithMetadata(res, { findings, totalCount: findings.length }, reportContext);
  });

  app.get('/v1/providers/:providerId/findings/:findingId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, findingId: zFindingId }).strip(),
    });
    if (!parsed) return;
    const { providerId, findingId } = parsed.params as { providerId: string; findingId: string };
    const finding = await store.getFindingById(ctx, findingId);

    if (!finding || finding.providerId !== providerId) {
      sendError(res, 404, 'Finding not found');
      return;
    }

    const reportContext = resolveReportContextForFinding(finding);
    sendWithMetadata(res, {
      finding,
      regulationText:
        'Regulation 12(2)(a): Care and treatment must be provided in a safe way for service users.',
    }, reportContext);
  });

  // ── Action Plans ──────────────────────────────────────────────────────────

  /**
   * GET /v1/providers/:providerId/findings/:findingId/action-plan
   *
   * Retrieve the action plan for a specific finding.
   * Returns empty actions array if no plan has been generated yet.
   */
  app.get('/v1/providers/:providerId/findings/:findingId/action-plan', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, findingId: zFindingId }).strip(),
    });
    if (!parsed) return;
    const { providerId, findingId } = parsed.params as { providerId: string; findingId: string };

    const finding = await store.getFindingById(ctx, findingId);
    if (!finding || finding.providerId !== providerId) {
      sendError(res, 404, 'Finding not found');
      return;
    }

    const actions = store.listActionsByFinding(ctx, findingId);
    const reportContext = resolveReportContextForFinding(finding);

    sendWithMetadata(res, {
      findingId,
      finding,
      actions,
      planStatus: computePlanStatus(actions),
      totalActions: actions.length,
      completedActions: actions.filter(a => a.status === 'VERIFIED_CLOSED').length,
      overdueActions: actions.filter(a =>
        a.targetCompletionDate && a.targetCompletionDate < new Date().toISOString() && a.status !== 'VERIFIED_CLOSED'
      ).length,
    }, reportContext);
  });

  /**
   * POST /v1/providers/:providerId/findings/:findingId/action-plan/generate
   *
   * Auto-generate action plan items from the finding's topic template.
   * Idempotent: if actions already exist for this finding, returns existing plan.
   */
  app.post('/v1/providers/:providerId/findings/:findingId/action-plan/generate', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, findingId: zFindingId }).strip(),
    });
    if (!parsed) return;
    const { providerId, findingId } = parsed.params as { providerId: string; findingId: string };

    const finding = await store.getFindingById(ctx, findingId);
    if (!finding || finding.providerId !== providerId) {
      sendError(res, 404, 'Finding not found');
      return;
    }

    // Idempotent: return existing actions if already generated
    const existing = store.listActionsByFinding(ctx, findingId);
    if (existing.length > 0) {
      const reportContext = resolveReportContextForFinding(finding);
      sendWithMetadata(res, {
        findingId,
        finding,
        actions: existing,
        planStatus: computePlanStatus(existing),
        totalActions: existing.length,
        completedActions: existing.filter(a => a.status === 'VERIFIED_CLOSED').length,
        overdueActions: 0,
        generated: false,
      }, reportContext);
      return;
    }

    const templates = ACTION_PLAN_TEMPLATES[finding.topicId] ?? [];
    const now = new Date();
    const actions = templates.map((template, index) => {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + template.defaultDueDays);
      return store.addAction(ctx, {
        providerId: finding.providerId,
        facilityId: finding.facilityId,
        findingId,
        topicId: finding.topicId,
        domain: 'CQC',
        reportingDomain: finding.reportingDomain as 'MOCK_SIMULATION' | 'REGULATORY_HISTORY',
        title: template.title,
        description: template.description,
        category: template.category,
        priority: template.priority,
        assignedTo: template.defaultOwner,
        targetCompletionDate: dueDate.toISOString(),
        status: 'OPEN',
        verificationEvidenceIds: [],
        sortOrder: index,
        createdBy: ctx.actorId,
        source: 'TEMPLATE',
      });
    });

    const reportContext = resolveReportContextForFinding(finding);
    sendWithMetadata(res, {
      findingId,
      finding,
      actions,
      planStatus: computePlanStatus(actions),
      totalActions: actions.length,
      completedActions: 0,
      overdueActions: 0,
      generated: true,
    }, reportContext);
  });

  /**
   * PATCH /v1/providers/:providerId/actions/:actionId
   *
   * Update an action item (status, owner, due date, notes).
   */
  app.patch('/v1/providers/:providerId/actions/:actionId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, actionId: zId }).strip(),
      body: z.object({
        status: z.enum(['OPEN', 'IN_PROGRESS', 'VERIFIED_CLOSED']).optional(),
        assignedTo: z.string().trim().optional(),
        targetCompletionDate: z.string().optional(),
        notes: z.string().trim().optional(),
      }).strip(),
    });
    if (!parsed) return;
    const { providerId, actionId: rawActionId } = parsed.params as { providerId: string; actionId: string };
    const updates = parsed.body as {
      status?: 'OPEN' | 'IN_PROGRESS' | 'VERIFIED_CLOSED';
      assignedTo?: string;
      targetCompletionDate?: string;
      notes?: string;
    };

    const actionId = decodeURIComponent(rawActionId);
    const existing = store.getActionById(ctx, actionId);
    if (!existing || existing.providerId !== providerId) {
      sendError(res, 404, 'Action not found');
      return;
    }

    // Validate status transitions
    if (updates.status) {
      const valid: Record<string, string[]> = {
        'OPEN': ['IN_PROGRESS'],
        'IN_PROGRESS': ['VERIFIED_CLOSED'],
        'VERIFIED_CLOSED': ['OPEN'],
        'REJECTED': ['OPEN'],
      };
      const allowed = valid[existing.status] ?? [];
      if (!allowed.includes(updates.status)) {
        sendError(res, 409, `Cannot transition from ${existing.status} to ${updates.status}`);
        return;
      }
    }

    const now = new Date().toISOString();
    const patchData: Parameters<typeof store.updateAction>[2] = {};

    if (updates.status) patchData.status = updates.status;
    if (updates.assignedTo !== undefined) patchData.assignedTo = updates.assignedTo;
    if (updates.targetCompletionDate !== undefined) patchData.targetCompletionDate = updates.targetCompletionDate;
    if (updates.notes !== undefined) patchData.notes = updates.notes;

    if (updates.status === 'VERIFIED_CLOSED') {
      patchData.completedAt = now;
      patchData.verifiedAt = now;
    } else if (updates.status === 'OPEN' && existing.status === 'VERIFIED_CLOSED') {
      patchData.completedAt = undefined;
      patchData.verifiedAt = undefined;
    }

    const updated = store.updateAction(ctx, actionId, patchData);
    if (!updated) {
      sendError(res, 500, 'Failed to update action');
      return;
    }

    // Audit the transition
    if (updates.status) {
      const eventTypes: Record<string, string> = {
        'IN_PROGRESS': 'ACTION_STARTED',
        'VERIFIED_CLOSED': 'ACTION_VERIFIED',
        'OPEN': existing.status === 'VERIFIED_CLOSED' ? 'ACTION_REOPENED' : 'ACTION_UPDATED',
      };
      await store.appendAuditEvent(ctx, providerId, eventTypes[updates.status] ?? 'ACTION_UPDATED', {
        actionId,
        findingId: existing.findingId,
        previousStatus: existing.status,
        newStatus: updates.status,
      });
    }

    const reportContext = {
      mode: 'MOCK' as const,
      reportingDomain: ReportingDomain.MOCK_SIMULATION,
      reportSource: { type: 'mock' as const, id: existing.findingId, asOf: now },
    };
    sendWithMetadata(res, updated, reportContext);
  });

  /**
   * GET /v1/providers/:providerId/action-plans
   *
   * List all action plans for a provider (grouped by finding).
   * Each plan includes the finding context and action counts.
   */
  app.get('/v1/providers/:providerId/action-plans', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };

    const allActions = store.listActionsByProvider(ctx, providerId).filter(a =>
      !facilityId || a.facilityId === facilityId
    );

    // Group by findingId
    const byFinding = new Map<string, typeof allActions>();
    for (const action of allActions) {
      const existing = byFinding.get(action.findingId) ?? [];
      existing.push(action);
      byFinding.set(action.findingId, existing);
    }

    const plans = await Promise.all(
      Array.from(byFinding.entries()).map(async ([findingId, actions]) => {
        const finding = await store.getFindingById(ctx, findingId);
        return {
          findingId,
          topicId: actions[0].topicId,
          findingTitle: finding?.title ?? findingId,
          findingSeverity: finding?.severity ?? 'MEDIUM',
          actions,
          computedStatus: computePlanStatus(actions),
          totalActions: actions.length,
          completedActions: actions.filter(a => a.status === 'VERIFIED_CLOSED').length,
        };
      })
    );

    sendWithMetadata(res, { plans });
  });

  /**
   * GET /v1/providers/:providerId/action-plans/summary
   *
   * Summary of all action plans across all findings for a provider.
   * Used by dashboard and roadmap views.
   */
  app.get('/v1/providers/:providerId/action-plans/summary', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };

    const allActions = store.listActionsByProvider(ctx, providerId).filter(a =>
      !facilityId || a.facilityId === facilityId
    );
    const now = new Date().toISOString();

    sendWithMetadata(res, {
      totalActions: allActions.length,
      openActions: allActions.filter(a => a.status === 'OPEN').length,
      inProgressActions: allActions.filter(a => a.status === 'IN_PROGRESS').length,
      completedActions: allActions.filter(a => a.status === 'VERIFIED_CLOSED').length,
      overdueActions: allActions.filter(a =>
        a.targetCompletionDate && a.targetCompletionDate < now && a.status !== 'VERIFIED_CLOSED'
      ).length,
      highPriorityOpen: allActions.filter(a => a.priority === 'HIGH' && a.status !== 'VERIFIED_CLOSED').length,
    });
  });

  // ── Evidence ───────────────────────────────────────────────────────────────

  app.get('/v1/providers/:providerId/evidence', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };

    const evidence = facilityId
      ? await store.listEvidenceByFacility(ctx, facilityId)
      : await store.listEvidenceByProvider(ctx, providerId);
    const auditSummaries = await listDocumentAuditSummariesByEvidenceRecordIds(
      ctx.tenantId,
      evidence.map((record) => record.id)
    );
    const mapped = evidence.map((record) => mapEvidenceRecord(record, auditSummaries.get(record.id)));
    const reportContext = facilityId
      ? await resolveReportContextForFacility(ctx, providerId, facilityId)
      : undefined;
    sendWithMetadata(res, { evidence: mapped, totalCount: mapped.length }, reportContext);
  });

  app.post('/v1/evidence/blobs', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      body: z
        .object({
          contentBase64: zBase64,
          mimeType: zMimeType,
        })
        .strip(),
    });
    if (!parsed) return;
    const { contentBase64, mimeType } = parsed.body as {
      contentBase64: string;
      mimeType: string;
    };

    try {
      // Decode base64 content
      const content = Buffer.from(contentBase64, 'base64');

      // Upload to blob storage (handles deduplication)
      const blobMetadata = await blobStorage.upload(content, mimeType);

      // Create blob record in store
      await store.createEvidenceBlob(ctx, {
        contentBase64,
        mimeType,
      });

      // Enqueue malware scan
      const scanJob = await malwareScanQueue.add({
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        blobHash: blobMetadata.contentHash,
        mimeType,
      } as MalwareScanJobData);

      setBounded(blobScanJobs, blobMetadata.contentHash, scanJob.id);

      if (await malwareScanQueue.isInMemory()) {
        await processInMemoryJob(
          QUEUE_NAMES.MALWARE_SCAN,
          scanJob.id,
          async (data: MalwareScanJobData): Promise<MalwareScanJobResult> => {
            const result = await scanBlob(data.blobHash);
            return {
              clean: result.status === 'CLEAN',
              threats: result.threat ? [result.threat] : undefined,
            };
          }
        );
      }

      // Return blob metadata
      sendWithMetadata(res, {
        blobHash: blobMetadata.contentHash,
        mimeType: blobMetadata.contentType,
        sizeBytes: blobMetadata.sizeBytes,
        uploadedAt: blobMetadata.uploadedAt,
        scanStatus: 'PENDING', // Will be updated by background scan
        scanJobId: scanJob.id,
      });
    } catch (error) {
      console.error('[BLOB_UPLOAD] Failed:', error);
      sendError(res, 500, 'Failed to upload blob');
    }
  });

  /**
   * GET /v1/evidence/blobs/:blobHash
   *
   * Download blob content by hash.
   * Returns 404 if blob not found, quarantined, or not owned by tenant.
   * Security: Validates blob belongs to requesting tenant via EvidenceRecord lookup.
   */
  app.get('/v1/evidence/blobs/:blobHash', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ blobHash: zBlobHash }).strip(),
    });
    if (!parsed) return;
    const { blobHash } = parsed.params as { blobHash: string };

    try {
      // Security: Verify blob belongs to this tenant via EvidenceRecord
      const evidenceRecord = await store.getEvidenceRecordByContentHash(ctx, blobHash);
      if (!evidenceRecord) {
        // Return 404 to avoid revealing blob existence to other tenants
        sendError(res, 404, 'Blob not found');
        return;
      }

      // Verify blob exists in storage
      const exists = await blobStorage.exists(blobHash);
      if (!exists) {
        sendError(res, 404, 'Blob not found');
        return;
      }

      // Download blob content
      const content = await blobStorage.download(blobHash);

      // Use content type from evidence record
      res.setHeader('Content-Type', evidenceRecord.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${evidenceRecord.fileName || blobHash}"`);
      res.send(content);
    } catch (error) {
      console.error('[BLOB_DOWNLOAD] Failed:', error);
      sendError(res, 500, 'Failed to download blob');
    }
  });

  /**
   * GET /v1/evidence/blobs/:blobHash/scan
   *
   * Check malware scan status for a blob.
   */
  app.get('/v1/evidence/blobs/:blobHash/scan', async (req, res) => {
    const parsed = validateRequest(req, res, {
      params: z.object({ blobHash: zBlobHash }).strip(),
    });
    if (!parsed) return;
    const { blobHash } = parsed.params as { blobHash: string };

    try {
      const jobId = blobScanJobs.get(blobHash);
      if (!jobId) {
        sendError(res, 404, 'Scan job not found for blob');
        return;
      }

      const job = await malwareScanQueue.getJob(jobId);
      if (!job) {
        sendError(res, 404, 'Scan job not found');
        return;
      }

      if (job.state === 'completed' && job.result) {
        const result = job.result as MalwareScanJobResult;
        const scanStatus = result.clean ? 'CLEAN' : 'INFECTED';

        sendWithMetadata(res, {
          contentHash: blobHash,
          status: scanStatus,
          scannedAt: job.processedAt ? job.processedAt.toISOString() : new Date().toISOString(),
          threats: result.threats,
          scanJobId: jobId,
        });
        return;
      }

      const scannedAt = job.processedAt
        ? job.processedAt.toISOString()
        : job.createdAt.toISOString();
      sendWithMetadata(res, {
        contentHash: blobHash,
        status: 'PENDING',
        scannedAt,
        scanJobId: jobId,
        error: job.error,
      });
    } catch (error) {
      console.error('[BLOB_SCAN] Failed:', error);
      sendError(res, 500, 'Failed to check scan status');
    }
  });

  app.post('/v1/providers/:providerId/facilities', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      body: z
        .object({
          facilityName: z.string().trim().min(1),
          addressLine1: z.string().trim().min(1),
          townCity: z.string().trim().min(1),
          postcode: z.string().trim().min(1),
          cqcLocationId: zCqcLocationId,
          serviceType: zServiceType,
          capacity: zOptionalPositiveInt.optional(),
        })
        .strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const {
      facilityName,
      addressLine1,
      townCity,
      postcode,
      cqcLocationId,
      serviceType,
      capacity,
    } = parsed.body as {
      facilityName: string;
      addressLine1: string;
      townCity: string;
      postcode: string;
      cqcLocationId: string;
      serviceType: string;
      capacity?: number;
    };

    try {
      const facility = await store.createFacility(ctx, {
        providerId,
        facilityName: facilityName.trim(),
        addressLine1: addressLine1.trim(),
        townCity: townCity.trim(),
        postcode: postcode.trim(),
        cqcLocationId: cqcLocationId.trim(),
        serviceType: serviceType.trim(),
        capacity: typeof capacity === 'number' ? capacity : undefined,
      });
      await store.appendAuditEvent(ctx, providerId, 'FACILITY_CREATED', {
        facilityId: facility.id,
        facilityName: facility.facilityName,
        cqcLocationId: facility.cqcLocationId,
      });
      sendWithMetadata(res, { facility });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Facility creation failed';
      if (message.includes('already exists')) {
        sendError(res, 409, message);
      } else {
        sendError(res, 400, message);
      }
    }
  });

  app.get('/v1/providers/:providerId/facilities', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const provider = await store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }
    const facilities = await store.listFacilitiesByProvider(ctx, providerId);
    sendWithMetadata(res, { provider, facilities, totalCount: facilities.length });
  });

  app.get('/v1/facilities', async (req, res) => {
    const ctx = getContext(req);
    const facilities = await store.listFacilities(ctx);
    sendWithMetadata(res, { facilities, totalCount: facilities.length });
  });

  app.get('/v1/facilities/:facilityId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };
    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }
    const provider = await store.getProviderById(ctx, facility.providerId);
    const reportContext = await resolveReportContextForFacility(ctx, facility.providerId, facilityId);
    sendWithMetadata(res, { facility, provider }, reportContext);
  });

  /**
   * PATCH /v1/facilities/:facilityId
   *
   * Update a location's mutable fields. CQC Location ID and provider are immutable.
   */
  app.patch('/v1/facilities/:facilityId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
      body: z
        .object({
          facilityName: z.string().trim().min(1).optional(),
          addressLine1: z.string().trim().min(1).optional(),
          townCity: z.string().trim().min(1).optional(),
          postcode: z.string().trim().min(1).optional(),
          serviceType: zServiceType.optional(),
          capacity: zOptionalPositiveInt.optional(),
        })
        .strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };
    const updates = parsed.body as {
      facilityName?: string;
      addressLine1?: string;
      townCity?: string;
      postcode?: string;
      serviceType?: string;
      capacity?: number;
    };

    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    try {
      const updated = await store.updateFacility(ctx, facilityId, updates);
      await store.appendAuditEvent(ctx, facility.providerId, 'FACILITY_UPDATED', {
        facilityId,
        facilityName: updated.facilityName,
        cqcLocationId: updated.cqcLocationId,
        updatedFields: Object.keys(updates),
      });
      const provider = await store.getProviderById(ctx, updated.providerId);
      sendWithMetadata(res, { facility: updated, provider });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      sendError(res, 400, message);
    }
  });

  /**
   * DELETE /v1/facilities/:facilityId
   *
   * Delete a location. Guards against deletion if in-progress sessions exist.
   */
  app.delete('/v1/facilities/:facilityId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };

    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    try {
      await store.deleteFacility(ctx, facilityId);
      await store.appendAuditEvent(ctx, facility.providerId, 'FACILITY_DELETED', {
        facilityId,
        facilityName: facility.facilityName,
        cqcLocationId: facility.cqcLocationId,
      });
      sendWithMetadata(res, { deleted: true, facilityId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      sendError(res, 409, message);
    }
  });

  /**
   * DELETE /v1/facilities/:facilityId/evidence/:evidenceId
   *
   * Delete an evidence record. Does not delete the underlying blob.
   */
  app.delete('/v1/facilities/:facilityId/evidence/:evidenceId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId, evidenceId: zId }).strip(),
    });
    if (!parsed) return;
    const { facilityId, evidenceId } = parsed.params as { facilityId: string; evidenceId: string };

    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    try {
      const deleted = await store.deleteEvidenceRecord(ctx, evidenceId);
      await store.appendAuditEvent(ctx, facility.providerId, 'EVIDENCE_DELETED', {
        facilityId,
        evidenceRecordId: evidenceId,
        fileName: deleted.fileName,
        blobHash: deleted.blobHash,
      });
      sendWithMetadata(res, { deleted: true, evidenceRecordId: evidenceId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      sendError(res, 404, message);
    }
  });

  /**
   * POST /v1/facilities/onboard
   *
   * Onboards a facility by CQC Location ID with automatic CQC API enrichment.
   *
   * Process:
   * 1. Validates CQC Location ID format
   * 2. Attempts to fetch from CQC API (5s timeout)
   * 3. Merges CQC data with user input (or uses manual if CQC fails)
   * 4. Upserts facility (creates if new, updates if exists)
   * 5. Audits the event
   *
   * Idempotent: Re-onboarding same CQC ID updates the facility.
   */
  app.post('/v1/facilities/onboard', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      body: z
        .object({
          providerId: zProviderId,
          cqcLocationId: zCqcLocationId,
          facilityName: z.string().trim().min(1).optional(),
          addressLine1: z.string().trim().min(1).optional(),
          townCity: z.string().trim().min(1).optional(),
          postcode: z.string().trim().min(1).optional(),
          serviceType: zServiceType.optional(),
          capacity: zOptionalPositiveInt.optional(),
        })
        .strip(),
    });
    if (!parsed) return;
    const {
      providerId,
      cqcLocationId,
      facilityName,
      addressLine1,
      townCity,
      postcode,
      serviceType,
      capacity,
    } = parsed.body as {
      providerId: string;
      cqcLocationId: string;
      facilityName?: string;
      addressLine1?: string;
      townCity?: string;
      postcode?: string;
      serviceType?: string;
      capacity?: number;
    };

    // Validate provider exists
    const provider = await store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }

    try {
      // Attempt onboarding with CQC API
      const onboardingResult = await onboardFacility(
        {
          providerId,
          cqcLocationId,
          facilityName,
          addressLine1,
          townCity,
          postcode,
          serviceType,
          capacity: typeof capacity === 'number' ? capacity : undefined,
        },
        {
          apiKey: process.env.CQC_API_KEY, // Use API key from environment if available
        }
      );

      // Upsert the facility (create or update)
      const { facility, isNew } = await store.upsertFacility(ctx, {
        ...onboardingResult.facilityData,
        providerId,
      });

      // Audit the event
      const eventType = isNew ? 'FACILITY_ONBOARDED' : 'FACILITY_UPDATED';
      await store.appendAuditEvent(ctx, providerId, eventType, {
        facilityId: facility.id,
        cqcLocationId: facility.cqcLocationId,
        dataSource: facility.dataSource,
        isNew,
      });

      // Enqueue report scraping
      const syncJob = await scrapeReportQueue.add({
        tenantId: ctx.tenantId,
        facilityId: facility.id,
        locationId: facility.cqcLocationId,
      } as ScrapeReportJobData);

      if (await scrapeReportQueue.isInMemory()) {
        await processInMemoryJob(
          QUEUE_NAMES.SCRAPE_REPORT,
          syncJob.id,
          async (data: ScrapeReportJobData) => handleScrapeReportJob(data, ctx)
        );
      }

      // Return response with onboarding metadata
      sendWithMetadata(res, {
        facility,
        cqcData: onboardingResult.cqcData,
        isNew,
        dataSource: facility.dataSource,
        syncedAt: facility.cqcSyncedAt,
        reportSyncJobId: syncJob.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Facility onboarding failed';
      sendError(res, 400, message);
    }
  });

  app.post('/v1/facilities/:facilityId/evidence', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
      body: z
        .object({
          blobHash: zBlobHash,
          evidenceType: zEvidenceType,
          fileName: z.string().trim().min(1),
          description: z.string().trim().min(1).optional(),
          expiresAt: z.string().trim().min(1).optional(),
        })
        .strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };
    const { blobHash, evidenceType, fileName, description, expiresAt } = parsed.body as {
      blobHash: string;
      evidenceType: EvidenceType;
      fileName: string;
      description?: string;
      expiresAt?: string;
    };

    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    try {
      const record = await store.createEvidenceRecord(ctx, {
        facilityId,
        providerId: facility.providerId,
        blobHash,
        evidenceType,
        fileName,
        description,
        expiresAt,
      });
      const documentType = detectDocumentType(record.fileName, record.mimeType, record.evidenceType);
      let documentAuditSummary = createPendingDocumentAuditSummary(record.id, {
        documentType,
        originalFileName: record.fileName,
      });

      await savePendingDocumentAudit({
        tenantId: ctx.tenantId,
        facilityId,
        providerId: facility.providerId,
        evidenceRecordId: record.id,
        fileName: record.fileName,
        documentType,
      });

      try {
        const job = await documentAuditQueue.add({
          tenantId: ctx.tenantId,
          facilityId,
          facilityName: facility.facilityName || 'Unknown facility',
          providerId: facility.providerId,
          evidenceRecordId: record.id,
          blobHash: record.blobHash,
          fileName: record.fileName,
          mimeType: record.mimeType,
          evidenceType: record.evidenceType,
          serviceType: facility.serviceType,
        } as DocumentAuditJobData);
        console.log(`[AUDIT] Queued job ${job.id} for evidence ${record.id}`);
      } catch (error) {
        const failureReason = 'Document audit could not be queued. Review manually or retry.';
        console.error('[AUDIT] Failed to enqueue:', error);
        await saveDocumentAuditFailure({
          tenantId: ctx.tenantId,
          facilityId,
          providerId: facility.providerId,
          evidenceRecordId: record.id,
          fileName: record.fileName,
          documentType,
          status: 'FAILED',
          failureReason,
        });
        documentAuditSummary = createDocumentAuditStatusSummary('FAILED', record.id, {
          documentType,
          originalFileName: record.fileName,
          failureReason,
        });
      }

      await store.appendAuditEvent(ctx, facility.providerId, 'EVIDENCE_RECORDED', {
        facilityId,
        evidenceRecordId: record.id,
        blobHash: record.blobHash,
        fileName: record.fileName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        evidenceType: record.evidenceType,
      });

      const reportContext = await resolveReportContextForFacility(ctx, facility.providerId, facilityId);
      const processJob = await evidenceProcessQueue.add({
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        evidenceRecordId: record.id,
        blobHash: record.blobHash,
        mimeType: record.mimeType,
        fileName: record.fileName,
        evidenceType: record.evidenceType as EvidenceType,
        facilityId,
        providerId: facility.providerId,
      } as EvidenceProcessJobData);

      if (await evidenceProcessQueue.isInMemory()) {
        await processInMemoryJob(
          QUEUE_NAMES.EVIDENCE_PROCESS,
          processJob.id,
          async () => ({
            evidenceRecordId: record.id,
            processingTimeMs: 0,
          })
        );
      }

      sendWithMetadata(
        res,
        {
          record: mapEvidenceRecord(record, documentAuditSummary),
          processingJobId: processJob.id,
          processingStatus: 'PENDING',
        },
        reportContext
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evidence record failed';
      sendError(res, 400, message);
    }
  });

  app.get('/v1/facilities/:facilityId/evidence', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };
    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }
    const evidence = await store.listEvidenceByFacility(ctx, facilityId);
    const auditSummaries = await listDocumentAuditSummariesByEvidenceRecordIds(
      ctx.tenantId,
      evidence.map((record) => record.id)
    );
    const mapped = evidence.map((record) => mapEvidenceRecord(record, auditSummaries.get(record.id)));
    const reportContext = await resolveReportContextForFacility(ctx, facility.providerId, facilityId);
    sendWithMetadata(res, { evidence: mapped, totalCount: mapped.length }, reportContext);
  });

  app.get('/v1/evidence/:evidenceRecordId/document-audit', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ evidenceRecordId: zId }).strip(),
    });
    if (!parsed) return;
    const { evidenceRecordId } = parsed.params as { evidenceRecordId: string };

    const audit = await getDocumentAuditByEvidenceRecordId(ctx.tenantId, evidenceRecordId);
    sendWithMetadata(
      res,
      audit ?? createPendingDocumentAuditSummary(evidenceRecordId)
    );
  });

  app.get('/v1/providers/:providerId/exports', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };

    const reportContext = facilityId
      ? await resolveReportContextForFacility(ctx, providerId, facilityId)
      : undefined;

    // Get actual exports from store
    let exports = await store.listExportsByProvider(ctx, providerId, facilityId);
    if (reportContext) {
      exports = exports.filter(
        (record) => record.reportingDomain === reportContext.reportingDomain
      );
    }
    const latestExport = exports[0]; // Already sorted by most recent

    const availableFormats = ['CSV', 'PDF', 'BLUE_OCEAN_BOARD', 'BLUE_OCEAN_AUDIT', 'INSPECTOR_PACK'];

    sendWithMetadata(res, {
      providerId,
      availableFormats,
      watermark:
        reportContext?.mode === 'REAL'
          ? 'BLUE OCEAN — REGULATORY HISTORY'
          : EXPORT_WATERMARK,
      latestExport: latestExport
        ? {
          exportId: latestExport.id,
          format: latestExport.format,
          generatedAt: latestExport.generatedAt,
          downloadUrl: `/v1/exports/${latestExport.id}.${getExportExtension(latestExport.format)}`
        }
        : undefined,
    }, reportContext);
  });

  app.post('/v1/providers/:providerId/exports', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      body: z
        .object({
          facilityId: zFacilityId,
          format: zExportFormat.optional(),
          outputFormat: z.enum(['pdf', 'docx', 'csv', 'md']).optional(),
        })
        .strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facilityId, format, outputFormat: requestedOutputFormat } = parsed.body as {
      facilityId: string;
      format?: string;
      outputFormat?: string;
    };

    const safeFormat = normalizeExportFormat(format);
    const facilityReportContext = await resolveReportContextForFacility(ctx, providerId, facilityId);

    // ── INSPECTOR_PACK: facility-level evidence pack (works in both REAL and MOCK modes) ──
    if (safeFormat === 'INSPECTOR_PACK') {
      const facility = await store.getFacilityById(ctx, facilityId);
      if (!facility) {
        sendError(res, 404, 'Facility not found', facilityReportContext);
        return;
      }

      const metadata = buildConstitutionalMetadata(facilityReportContext);
      const evidenceRecords = await store.listEvidenceByFacility(ctx, facilityId);
      const auditSummaries = await listDocumentAuditSummariesByEvidenceRecordIds(
        ctx.tenantId,
        evidenceRecords.map((r) => r.id)
      );

      const evidenceInputs: EvidenceInput[] = evidenceRecords.map((record) => {
        const audit = auditSummaries.get(record.id);
        return {
          evidenceId: record.id,
          fileName: record.fileName,
          evidenceType: record.evidenceType,
          description: record.description,
          uploadedAt: record.uploadedAt,
          expiresAt: record.expiresAt ?? null,
          audit: audit
            ? {
                status: audit.status,
                overallResult: audit.overallResult,
                complianceScore: audit.complianceScore,
                safStatements: audit.result?.safStatements,
              }
            : null,
        };
      });

      // Fetch mock inspection findings for this facility to populate QS coverage
      const allFindings = (await store.listFindingsByProvider(ctx, providerId))
        .filter((finding) => finding.facilityId === facilityId);

      const findingInputs: FindingInput[] = allFindings.map((finding) => {
        const topic = TOPICS.find((t) => t.id === finding.topicId);
        return {
          findingId: finding.id,
          topicId: finding.topicId,
          topicTitle: topic?.title ?? finding.topicId,
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          createdAt: finding.createdAt,
        };
      });

      const pack = generateInspectorEvidencePack({
        facilityName: facility.facilityName,
        facilityId: facility.id,
        inspectionStatus: facility.inspectionStatus,
        evidenceInputs,
        findingInputs,
        metadata: {
          topicCatalogVersion: metadata.topicCatalogVersion,
          topicCatalogHash: metadata.topicCatalogHash,
          prsLogicProfilesVersion: metadata.prsLogicVersion,
          prsLogicProfilesHash: metadata.prsLogicHash,
        },
        watermark: facilityReportContext.mode === 'REAL' ? null : 'PRACTICE — NOT AN OFFICIAL CQC RECORD',
      });

      const outFmt = resolveOutputFormat(safeFormat, requestedOutputFormat);
      let content: string;
      let contentEncoding: 'utf8' | 'base64' = 'utf8';

      if (outFmt === 'pdf') {
        const rendered = await renderInspectorPackPdf(pack);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      } else if (outFmt === 'docx') {
        const rendered = await renderInspectorPackDocx(pack);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      } else {
        content = serializeInspectorPackMarkdown(pack);
      }

      const exportRecord = await store.createExport(ctx, {
        providerId,
        facilityId,
        sessionId: facilityReportContext.reportSource.id,
        format: 'INSPECTOR_PACK',
        content,
        contentEncoding,
        reportingDomain: facilityReportContext.reportingDomain,
        mode: facilityReportContext.mode,
        reportSource: facilityReportContext.reportSource,
        snapshotId: facilityReportContext.snapshotId,
      });

      // Track usage event for billing hooks
      await store.createUsageEvent(ctx, {
        providerId,
        eventType: 'INSPECTOR_PACK_GENERATED',
        resourceId: exportRecord.id,
        metadata: { facilityId, facilityName: facility.facilityName },
      });

      await store.appendAuditEvent(ctx, providerId, 'EXPORT_GENERATED', {
        exportId: exportRecord.id,
        format: 'INSPECTOR_PACK',
        facilityId,
      });

      const fileExtension = getExportExtension(safeFormat, outFmt);
      const downloadUrl = `/v1/exports/${exportRecord.id}.${fileExtension}`;

      sendWithMetadata(res, {
        exportId: exportRecord.id,
        downloadUrl,
        expiresAt: exportRecord.expiresAt,
      }, facilityReportContext);
      return;
    }

    if (facilityReportContext.mode === 'REAL') {
      if (safeFormat !== 'BLUE_OCEAN_BOARD' && safeFormat !== 'BLUE_OCEAN_AUDIT') {
        sendError(res, 409, 'Regulatory exports require Blue Ocean formats', facilityReportContext);
        return;
      }

      const metadata = buildConstitutionalMetadata(facilityReportContext);
      const topicCatalogSha = metadata.topicCatalogHash.replace('sha256:', '');
      const prsLogicSha = metadata.prsLogicHash.replace('sha256:', '');

      const regulatoryFindings = (await store.listFindingsByProvider(ctx, providerId))
        .filter((finding) => finding.facilityId === facilityId)
        .filter((finding) => finding.reportingDomain === ReportingDomain.REGULATORY_HISTORY);

      const inspectionFindings = regulatoryFindings.map((finding) => {
        const provData = {
          domain: Domain.CQC,
          origin: finding.origin as FindingOrigin,
          reportingDomain: finding.reportingDomain as ReportingDomain,
          contextSnapshotId: facilityReportContext.snapshotId,
          regulationId: finding.regulationSectionId,
          regulationSectionId: finding.regulationSectionId,
          title: finding.title,
          description: finding.description,
        };
        return {
          id: finding.id,
          tenantId: finding.tenantId,
          domain: Domain.CQC,
          origin: finding.origin as FindingOrigin,
          reportingDomain: finding.reportingDomain as ReportingDomain,
          contextSnapshotId: facilityReportContext.snapshotId,
          regulationId: finding.regulationSectionId,
          regulationSectionId: finding.regulationSectionId,
          title: finding.title,
          description: finding.description,
          severity: finding.severity as Severity,
          impactScore: finding.impactScore,
          likelihoodScore: finding.likelihoodScore,
          compositeRiskScore: computeCompositeRiskScore(finding.impactScore, finding.likelihoodScore),
          provenanceHash: computeProvenanceHash(provData),
          identifiedAt: finding.createdAt,
          identifiedBy: finding.origin,
          createdAt: finding.createdAt,
        };
      });

      const evidenceRecords = (await store.listEvidenceByFacility(ctx, facilityId)).map((record) => {
        const linkedFindingIds = inspectionFindings.map(f => f.id);
        return {
          id: record.id,
          tenantId: record.tenantId,
          blobHashes: [record.blobHash],
          primaryBlobHash: record.blobHash,
          title: record.fileName,
          description: record.description,
          evidenceType: record.evidenceType,
          supportsFindingIds: linkedFindingIds,
          supportsPolicyIds: [],
          collectedAt: record.uploadedAt,
          collectedBy: record.createdBy,
          accessRevoked: false,
          createdAt: record.uploadedAt,
          createdBy: record.createdBy,
        };
      });

      const actions: Action[] = [];
      for (const finding of inspectionFindings) {
        const actionRecords = store.listActionsByFinding(ctx, finding.id);
        for (const ar of actionRecords) {
          actions.push({
            id: ar.id,
            tenantId: ar.tenantId,
            domain: Domain.CQC,
            findingId: ar.findingId,
            description: ar.description,
            assignedTo: ar.assignedTo,
            targetCompletionDate: ar.targetCompletionDate ?? null,
            status: ar.status as ActionStatus,
            verificationEvidenceIds: ar.verificationEvidenceIds,
            createdAt: ar.createdAt,
            createdBy: ar.createdBy,
            completedAt: ar.completedAt ?? null,
            verifiedAt: ar.verifiedAt ?? null,
          });
        }
      }

      const blueOceanReport = generateBlueOceanReport({
        tenantId: ctx.tenantId,
        domain: Domain.CQC,
        topicCatalogVersion: metadata.topicCatalogVersion,
        topicCatalogHash: topicCatalogSha,
        prsLogicProfilesVersion: metadata.prsLogicVersion,
        prsLogicProfilesHash: prsLogicSha,
        findings: inspectionFindings,
        actions,
        evidence: evidenceRecords,
        reportingDomain: ReportingDomain.REGULATORY_HISTORY,
      });

      const outFmt = resolveOutputFormat(safeFormat, requestedOutputFormat);
      let content: string;
      let contentEncoding: 'utf8' | 'base64' = 'utf8';

      if (outFmt === 'pdf') {
        const rendered = safeFormat === 'BLUE_OCEAN_AUDIT'
          ? await renderBlueOceanAuditPdf(blueOceanReport)
          : await renderBlueOceanBoardPdf(blueOceanReport);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      } else if (outFmt === 'docx') {
        const rendered = safeFormat === 'BLUE_OCEAN_AUDIT'
          ? await renderBlueOceanAuditDocx(blueOceanReport)
          : await renderBlueOceanBoardDocx(blueOceanReport);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      } else {
        content = safeFormat === 'BLUE_OCEAN_AUDIT'
          ? serializeBlueOceanAuditMarkdown(blueOceanReport)
          : serializeBlueOceanBoardMarkdown(blueOceanReport);
      }

      const exportRecord = await store.createExport(ctx, {
        providerId,
        facilityId,
        sessionId: facilityReportContext.reportSource.id,
        format: safeFormat,
        content,
        contentEncoding,
        reportingDomain: facilityReportContext.reportingDomain,
        mode: facilityReportContext.mode,
        reportSource: facilityReportContext.reportSource,
        snapshotId: facilityReportContext.snapshotId,
      });

      await store.appendAuditEvent(ctx, providerId, 'EXPORT_GENERATED', {
        exportId: exportRecord.id,
        format: safeFormat,
        facilityId,
      });

      const fileExtension = getExportExtension(safeFormat, outFmt);
      const downloadUrl = `/v1/exports/${exportRecord.id}.${fileExtension}`;

      sendWithMetadata(res, {
        exportId: exportRecord.id,
        downloadUrl,
        expiresAt: exportRecord.expiresAt,
      }, facilityReportContext);
      return;
    }

    const session = (await store.listSessionsByProvider(ctx, providerId))
      .filter((item) => item.facilityId === facilityId)
      .find((item) => item.status === 'COMPLETED');

    if (!session) {
      sendError(res, 409, 'No completed session available for export', facilityReportContext);
      return;
    }

    const reportContext = resolveReportContextForSession(session);

    const findings = (await store.listFindingsByProvider(ctx, providerId))
      .filter((finding) => finding.sessionId === session.sessionId)
      .map<DraftFinding>((finding) => ({
        id: finding.id,
        sessionId: finding.sessionId,
        topicId: finding.topicId,
        regulationId: finding.regulationSectionId,
        regulationSectionId: finding.regulationSectionId,
        title: finding.title,
        description: finding.description,
        severity: finding.severity as Severity,
        impactScore: finding.impactScore,
        likelihoodScore: finding.likelihoodScore,
        draftedAt: finding.createdAt,
        draftedBy: 'system',
      }));

    const topicCatalogSha = session.topicCatalogHash.replace('sha256:', '');
    const prsLogicSha = session.prsLogicProfilesHash.replace('sha256:', '');

    // Look up human-readable names for the PDF/DOCX title page.
    // Use list-based lookup to avoid silent failures from key scoping mismatches.
    // NOTE: Exports are cached — users must generate a NEW export after this fix to see corrected names.
    const allProviders = store.listProviders(ctx);
    const matchedProvider = allProviders.find(p => p.providerId === providerId);
    const allFacilities = store.listFacilities(ctx);
    const matchedFacility = allFacilities.find(f => f.id === facilityId);

    const metadata = {
      sessionId: session.sessionId,
      providerId,
      providerName: matchedProvider?.providerName,
      facilityName: matchedFacility?.facilityName,
      topicCatalogVersion: session.topicCatalogVersion,
      topicCatalogSha256: topicCatalogSha,
      prsLogicProfilesVersion: session.prsLogicProfilesVersion,
      prsLogicProfilesSha256: prsLogicSha,
    };

    const domainSession = buildDomainSession(session, findings);

    const outFmt = resolveOutputFormat(safeFormat, requestedOutputFormat);
    let content: string;
    let contentEncoding: 'utf8' | 'base64' = 'utf8';

    if (safeFormat === 'CSV') {
      // Collect action plan data for CSV enrichment columns
      const csvActions: CsvActionRecord[] = [];
      for (const finding of domainSession.draftFindings) {
        const actions = store.listActionsByFinding(ctx, finding.id);
        for (const action of actions) {
          csvActions.push({
            findingId: finding.id,
            status: action.status,
            ownerRole: action.assignedTo,
            targetCompletionDate: action.targetCompletionDate,
          });
        }
      }

      // TODO: Evidence coverage records not yet available per-topic from store
      const csvEvidenceRecords: CsvEvidenceRecord[] = [];

      const csvExport = generateCsvExport(domainSession, metadata, csvActions, csvEvidenceRecords);
      content = serializeCsvExport(csvExport);
    } else if (safeFormat === 'BLUE_OCEAN_BOARD' || safeFormat === 'BLUE_OCEAN_AUDIT') {
      const inspectionFindings = findings.map((f) => {
        const provData = {
          domain: Domain.CQC,
          origin: FindingOrigin.SYSTEM_MOCK,
          reportingDomain: ReportingDomain.MOCK_SIMULATION,
          contextSnapshotId: reportContext.snapshotId,
          regulationId: f.regulationId,
          regulationSectionId: f.regulationSectionId,
          title: f.title,
          description: f.description,
        };
        return {
          id: f.id,
          tenantId: session.tenantId,
          domain: Domain.CQC,
          origin: FindingOrigin.SYSTEM_MOCK,
          reportingDomain: ReportingDomain.MOCK_SIMULATION,
          contextSnapshotId: reportContext.snapshotId,
          regulationId: f.regulationId,
          regulationSectionId: f.regulationSectionId,
          title: f.title,
          description: f.description,
          severity: f.severity as Severity,
          impactScore: f.impactScore,
          likelihoodScore: f.likelihoodScore,
          compositeRiskScore: computeCompositeRiskScore(f.impactScore, f.likelihoodScore),
          provenanceHash: computeProvenanceHash(provData),
          identifiedAt: f.draftedAt,
          identifiedBy: f.draftedBy,
          createdAt: f.draftedAt,
        };
      });

      const evidenceRecords = (await store.listEvidenceByFacility(ctx, facilityId)).map((record) => {
        const linkedFindingIds = inspectionFindings.map(f => f.id);
        return {
          id: record.id,
          tenantId: record.tenantId,
          blobHashes: [record.blobHash],
          primaryBlobHash: record.blobHash,
          title: record.fileName,
          description: record.description,
          evidenceType: record.evidenceType,
          supportsFindingIds: linkedFindingIds,
          supportsPolicyIds: [],
          collectedAt: record.uploadedAt,
          collectedBy: record.createdBy,
          accessRevoked: false,
          createdAt: record.uploadedAt,
          createdBy: record.createdBy,
        };
      });

      const actions: Action[] = [];
      for (const finding of inspectionFindings) {
        const actionRecords = store.listActionsByFinding(ctx, finding.id);
        for (const ar of actionRecords) {
          actions.push({
            id: ar.id,
            tenantId: ar.tenantId,
            domain: Domain.CQC,
            findingId: ar.findingId,
            description: ar.description,
            assignedTo: ar.assignedTo,
            targetCompletionDate: ar.targetCompletionDate ?? null,
            status: ar.status as ActionStatus,
            verificationEvidenceIds: ar.verificationEvidenceIds,
            createdAt: ar.createdAt,
            createdBy: ar.createdBy,
            completedAt: ar.completedAt ?? null,
            verifiedAt: ar.verifiedAt ?? null,
          });
        }
      }

      const blueOceanReport = generateBlueOceanReport({
        tenantId: session.tenantId,
        domain: Domain.CQC,
        topicCatalogVersion: session.topicCatalogVersion,
        topicCatalogHash: topicCatalogSha,
        prsLogicProfilesVersion: session.prsLogicProfilesVersion,
        prsLogicProfilesHash: prsLogicSha,
        findings: inspectionFindings,
        actions,
        evidence: evidenceRecords,
        reportingDomain: ReportingDomain.MOCK_SIMULATION,
      });

      if (outFmt === 'pdf') {
        const rendered = safeFormat === 'BLUE_OCEAN_AUDIT'
          ? await renderBlueOceanAuditPdf(blueOceanReport)
          : await renderBlueOceanBoardPdf(blueOceanReport);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      } else if (outFmt === 'docx') {
        const rendered = safeFormat === 'BLUE_OCEAN_AUDIT'
          ? await renderBlueOceanAuditDocx(blueOceanReport)
          : await renderBlueOceanBoardDocx(blueOceanReport);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      } else {
        content = safeFormat === 'BLUE_OCEAN_AUDIT'
          ? serializeBlueOceanAuditMarkdown(blueOceanReport)
          : serializeBlueOceanBoardMarkdown(blueOceanReport);
      }
    } else {
      // PDF (mock findings)
      const pdfExport = generatePdfExport(domainSession, metadata);
      if (outFmt === 'docx') {
        const rendered = await renderFindingsDocx(pdfExport);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      } else {
        // Default: real PDF
        const rendered = await renderFindingsPdf(pdfExport);
        content = rendered.buffer.toString('base64');
        contentEncoding = 'base64';
      }
    }

    const exportRecord = await store.createExport(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      format: safeFormat,
      content,
      contentEncoding,
      reportingDomain: reportContext.reportingDomain,
      mode: reportContext.mode,
      reportSource: reportContext.reportSource,
      snapshotId: reportContext.snapshotId,
    });

    await store.appendAuditEvent(ctx, providerId, 'EXPORT_GENERATED', {
      exportId: exportRecord.id,
      format: safeFormat,
      facilityId,
    });

    const fileExtension = getExportExtension(safeFormat, outFmt);
    const downloadUrl = `/v1/exports/${exportRecord.id}.${fileExtension}`;

    sendWithMetadata(res, {
      exportId: exportRecord.id,
      downloadUrl,
      expiresAt: exportRecord.expiresAt,
    }, reportContext);
  });

  app.get('/v1/exports/:exportId.csv', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ exportId: zExportId }).strip(),
    });
    if (!parsed) return;
    const { exportId } = parsed.params as { exportId: string };
    const exportRecord = await store.getExportById(ctx, exportId);
    if (!exportRecord || exportRecord.format !== 'CSV') {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.id}.csv"`);
    res.send(exportRecord.content);
  });

  app.get('/v1/exports/:exportId.pdf', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ exportId: zExportId }).strip(),
    });
    if (!parsed) return;
    const { exportId } = parsed.params as { exportId: string };
    const exportRecord = await store.getExportById(ctx, exportId);
    const validPdfFormats = ['PDF', 'BLUE_OCEAN_BOARD', 'BLUE_OCEAN_AUDIT', 'INSPECTOR_PACK'];
    if (!exportRecord || !validPdfFormats.includes(exportRecord.format)) {
      sendError(res, 404, 'Export not found');
      return;
    }
    // Only serve binary PDF (base64-encoded); utf8 exports are legacy markdown, not PDF
    if (exportRecord.contentEncoding !== 'base64') {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.id}.pdf"`);
    res.send(Buffer.from(exportRecord.content, 'base64'));
  });

  app.get('/v1/exports/:exportId.docx', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ exportId: zExportId }).strip(),
    });
    if (!parsed) return;
    const { exportId } = parsed.params as { exportId: string };
    const exportRecord = await store.getExportById(ctx, exportId);
    // DOCX exports are always base64-encoded binary; reject non-base64 exports
    if (!exportRecord || exportRecord.contentEncoding !== 'base64') {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.id}.docx"`);
    res.send(Buffer.from(exportRecord.content, 'base64'));
  });

  app.get('/v1/exports/:exportId.md', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ exportId: zExportId }).strip(),
    });
    if (!parsed) return;
    const { exportId } = parsed.params as { exportId: string };
    const exportRecord = await store.getExportById(ctx, exportId);
    if (
      !exportRecord ||
      (exportRecord.format !== 'BLUE_OCEAN' &&
        exportRecord.format !== 'BLUE_OCEAN_BOARD' &&
        exportRecord.format !== 'BLUE_OCEAN_AUDIT' &&
        exportRecord.format !== 'INSPECTOR_PACK')
    ) {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'text/markdown');
    const filename = exportRecord.format === 'INSPECTOR_PACK'
      ? `${exportRecord.id}.inspector-pack.md`
      : getBlueOceanFilename(exportRecord.id, exportRecord.format);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.send(exportRecord.content);
  });

  app.get('/v1/providers/:providerId/audit-trail', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
      query: z.object({ facility: zOptionalQueryString }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facility: facilityId } = parsed.query as { facility?: string };
    const events = await store.listAuditEvents(ctx, providerId);
    const reportContext = facilityId
      ? await resolveReportContextForFacility(ctx, providerId, facilityId)
      : undefined;
    sendWithMetadata(res, { events, totalCount: events.length }, reportContext);
  });

  /**
   * POST /v1/facilities/onboard-bulk
   *
   * Bulk onboards multiple facilities by CQC Location IDs.
   * Processes each facility with the same logic as single onboarding.
   * Returns success/failure status for each facility.
   */
  app.post('/v1/facilities/onboard-bulk', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      body: z
        .object({
          providerId: zProviderId,
          cqcLocationIds: z.array(zCqcLocationId).min(1).max(50),
          autoSyncReports: z.boolean().optional(),
        })
        .strip(),
    });
    if (!parsed) return;
    const {
      providerId,
      cqcLocationIds,
      autoSyncReports = false,
    } = parsed.body as {
      providerId: string;
      cqcLocationIds: string[];
      autoSyncReports?: boolean;
    };

    const provider = await store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }

    const results = [];

    for (const cqcLocationId of cqcLocationIds) {
      try {
        if (!isValidCqcLocationId(cqcLocationId)) {
          results.push({
            cqcLocationId,
            success: false,
            error: 'Invalid CQC Location ID format',
          });
          continue;
        }

        const onboardingResult = await onboardFacility(
          {
            providerId,
            cqcLocationId,
          },
          {
            apiKey: process.env.CQC_API_KEY, // Use API key from environment if available
          }
        );

        const { facility, isNew } = await store.upsertFacility(ctx, {
          ...onboardingResult.facilityData,
          providerId,
        });

        const eventType = isNew ? 'FACILITY_ONBOARDED' : 'FACILITY_UPDATED';
        await store.appendAuditEvent(ctx, providerId, eventType, {
          facilityId: facility.id,
          cqcLocationId: facility.cqcLocationId,
          dataSource: facility.dataSource,
          isNew,
          bulkOnboarding: true,
        });

        // Auto-enqueue report scraping if requested
        if (autoSyncReports) {
          const job = await scrapeReportQueue.add({
            tenantId: ctx.tenantId,
            facilityId: facility.id,
            locationId: facility.cqcLocationId,
          } as ScrapeReportJobData);

          if (await scrapeReportQueue.isInMemory()) {
            await processInMemoryJob(
              QUEUE_NAMES.SCRAPE_REPORT,
              job.id,
              async (data: ScrapeReportJobData) => handleScrapeReportJob(data, ctx)
            );
          }
        }

        results.push({
          cqcLocationId,
          success: true,
          facility: {
            id: facility.id,
            facilityName: facility.facilityName,
            inspectionStatus: facility.inspectionStatus,
            latestRating: facility.latestRating,
            dataSource: facility.dataSource,
          },
          isNew,
        });
      } catch (error) {
        results.push({
          cqcLocationId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    sendWithMetadata(res, {
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failureCount,
      },
      results,
      backgroundJobsQueued: autoSyncReports ? successCount : 0,
    });
  });

  /**
   * POST /v1/facilities/:facilityId/sync-latest-report
   *
   * Triggers background scraping of the latest CQC report for this facility.
   * Non-blocking: returns immediately and processes in background.
   */
  app.post('/v1/facilities/:facilityId/sync-latest-report', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };

    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    const job = await scrapeReportQueue.add({
      tenantId: ctx.tenantId,
      facilityId,
      locationId: facility.cqcLocationId,
    } as ScrapeReportJobData);

    if (await scrapeReportQueue.isInMemory()) {
      await processInMemoryJob(
        QUEUE_NAMES.SCRAPE_REPORT,
        job.id,
        async (data: ScrapeReportJobData) => handleScrapeReportJob(data, ctx)
      );
    }

    sendWithMetadata(res, {
      message: 'Report sync started',
      jobId: job.id,
      status: 'queued',
      estimatedCompletion: '30-60 seconds',
    });
  });

  /**
   * POST /v1/facilities/:facilityId/create-baseline
   *
   * For never-inspected facilities, creates a baseline through self-assessment.
   * Guides the facility through creating their first "pre-inspection" snapshot.
   */
  app.post('/v1/facilities/:facilityId/create-baseline', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ facilityId: zFacilityId }).strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };

    const facility = await store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    if (facility.inspectionStatus === 'INSPECTED') {
      sendError(res, 409, 'Facility already has inspection history. Use mock inspections instead.');
      return;
    }

    // Guide: Create a baseline mock inspection for never-inspected facilities
    const provider = await store.getProviderById(ctx, facility.providerId);
    if (!provider) {
      sendError(res, 500, 'Provider not found');
      return;
    }

    sendWithMetadata(res, {
      message: 'Baseline creation guide',
      facility: {
        id: facility.id,
        name: facility.facilityName,
        inspectionStatus: facility.inspectionStatus,
      },
      nextSteps: [
        {
          step: 1,
          action: 'Upload core policy documents',
          endpoint: `POST /v1/facilities/${facilityId}/evidence`,
          requiredEvidence: ['Policy', 'Staff Handbook', 'Risk Assessments'],
        },
        {
          step: 2,
          action: 'Complete self-assessment mock inspection',
          endpoint: `POST /v1/providers/${facility.providerId}/mock-sessions`,
          description:
            'Run mock inspections on key topics to establish baseline. These findings will not appear in regulatory history.',
          recommendedTopics: TOPICS.map((t) => t.id),
        },
        {
          step: 3,
          action: 'Review baseline findings and address gaps',
          endpoint: `GET /v1/providers/${facility.providerId}/findings?facility=${facilityId}`,
          description: 'Identify and remediate issues before first official inspection.',
        },
      ],
      guidance: {
        message:
          'Since this facility has never been inspected, establish a baseline by uploading policies and completing self-assessment mock inspections.',
        benefits: [
          'Identify compliance gaps before CQC inspection',
          'Build evidence library',
          'Train staff on inspection process',
          'Demonstrate proactive compliance',
        ],
      },
    });
  });

  /**
   * GET /v1/background-jobs/:jobId
   *
   * Check status of a background job.
   * Security: Validates job belongs to requesting tenant.
   */
  app.get('/v1/background-jobs/:jobId', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ jobId: zJobId }).strip(),
    });
    if (!parsed) return;
    const { jobId } = parsed.params as { jobId: string };
    const queueName = resolveQueueNameFromJobId(jobId);

    if (!queueName) {
      sendError(res, 404, 'Job not found');
      return;
    }

    try {
      const job = await getQueueAdapter(queueName).getJob(jobId);
      if (!job) {
        sendError(res, 404, 'Job not found');
        return;
      }

      // Security: Verify job belongs to requesting tenant
      const jobData = job.data as { tenantId?: string } | undefined;
      if (!jobData?.tenantId || jobData.tenantId !== ctx.tenantId) {
        // Return 404 to avoid revealing job existence to other tenants
        sendError(res, 404, 'Job not found');
        return;
      }

      const status = mapQueueStateToStatus(job.state);
      const createdAt = job.createdAt.toISOString();
      const completedAt = job.processedAt ? job.processedAt.toISOString() : undefined;

      sendWithMetadata(res, {
        job: {
          id: job.id,
          type: queueName,
          status,
          state: job.state,
          createdAt,
          completedAt,
          error: job.error,
          result: job.result,
        },
      });
    } catch (error) {
      console.error('[JOB_STATUS] Failed:', error);
      sendError(res, 500, 'Failed to fetch job status');
    }
  });

  /**
   * Report scraping processor (used for in-memory fallback).
   */
  async function handleScrapeReportJob(
    job: ScrapeReportJobData & { cqcLocationId?: string; providerId?: string },
    ctx: TenantContext
  ): Promise<ScrapeReportJobResult> {
    const cqcLocationId = job.cqcLocationId || job.locationId;
    const { facilityId } = job;

    try {
      const apiResult = await fetchCqcLocation(cqcLocationId, {
        apiKey: process.env.CQC_API_KEY,
      });
      const apiData = apiResult.success ? apiResult.data : null;
      const apiReportDate = apiData?.currentRatings?.overall?.reportDate;

      // Scrape latest report from CQC website
      const scrapeResult = await scrapeLatestReport(cqcLocationId);

      if (!scrapeResult.success) {
        return {
          success: false,
          error: scrapeResult.error.message,
        };
      }

      const { report } = scrapeResult;
      const websiteReportDate = report.reportDate || undefined;
      const facility = await store.getFacilityById(ctx, facilityId);

      if (!facility) {
        return {
          success: false,
          error: 'Facility not found',
        };
      }

      const providerId = facility.providerId;

      // Handle never-inspected facilities
      if (!report.hasReport) {
        // Update facility status
        await store.upsertFacility(ctx, {
          ...facility,
          inspectionStatus: 'NEVER_INSPECTED',
          lastReportScrapedAt: new Date().toISOString(),
        });

        return {
          success: true,
          reportDate: report.reportDate || undefined,
        };
      }

      const shouldDownloadReport =
        report.hasReport &&
        (isWebsiteReportNewer(websiteReportDate, apiReportDate) ||
          (!apiReportDate && Boolean(websiteReportDate)));

      const summary = buildCqcReportSummary(report, apiData);

      if (!shouldDownloadReport) {
        await store.upsertFacility(ctx, {
          ...facility,
          latestRating: summary.rating || facility.latestRating,
          latestRatingDate: summary.reportDate || facility.latestRatingDate,
          inspectionStatus: report.hasReport ? 'INSPECTED' : 'NEVER_INSPECTED',
          lastReportScrapedAt: new Date().toISOString(),
          lastScrapedReportDate: report.reportDate,
          lastScrapedReportUrl: report.reportUrl,
        });

        return {
          success: true,
          reportDate: summary.reportDate || undefined,
        };
      }

      // Save HTML report as evidence record
      if (report.hasReport) {
        try {
          const reportFileName = `CQC-Report-${report.reportDate || 'latest'}.html`;
          const { buffer: htmlBuffer, mimeType } = buildHtmlReportBuffer(report);
          const blobMetadata = await blobStorage.upload(htmlBuffer, mimeType);
          const existingByHash = await store.getEvidenceRecordByContentHash(ctx, blobMetadata.contentHash);

          if (!existingByHash) {
            // Register blob in store (required before createEvidenceRecord)
            const contentBase64 = htmlBuffer.toString('base64');
            await store.createEvidenceBlob(ctx, {
              contentBase64,
              mimeType,
            });

            await store.createEvidenceRecord(ctx, {
              facilityId,
              providerId,
              blobHash: blobMetadata.contentHash,
              evidenceType: EvidenceType.CQC_REPORT,
              fileName: reportFileName,
              description: `CQC inspection report (${report.rating || 'unknown rating'}) — ${report.reportDate || ''}`,
            });
            console.log('[SCRAPE] HTML report saved successfully:', blobMetadata.contentHash);
          } else {
            console.log('[SCRAPE] Duplicate report detected, skipping evidence record create:', blobMetadata.contentHash);
          }
        } catch (htmlErr) {
          console.error('[SCRAPE] Failed to save HTML report:', htmlErr);
        }
      }

      // Update facility with scraped data
      await store.upsertFacility(ctx, {
        ...facility,
        latestRating: summary.rating || report.rating || facility.latestRating,
        latestRatingDate: summary.reportDate || report.reportDate || facility.latestRatingDate,
        inspectionStatus: report.hasReport ? 'INSPECTED' : 'NEVER_INSPECTED',
        lastReportScrapedAt: new Date().toISOString(),
        lastScrapedReportDate: report.reportDate,
        lastScrapedReportUrl: report.reportUrl,
      });

      await store.appendAuditEvent(ctx, providerId, 'REPORT_SCRAPED', {
        facilityId,
        cqcLocationId,
        rating: report.rating,
        reportDate: report.reportDate,
        hasReport: report.hasReport,
      });

      return {
        success: true,
        reportDate: summary.reportDate || undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Seed demo data for development
  if (process.env.NODE_ENV !== 'production') {
    const demoContext: TenantContext = {
      tenantId: 'demo',
      actorId: 'SYSTEM',
    };

    // Handle both sync (InMemoryStore) and async (PrismaStore) seed methods
    try {
      const result = store.seedDemoProvider(demoContext);
      const handleResult = (provider: typeof result extends Promise<infer T> ? T : typeof result) => {
        if (provider) {
          console.log(`[SEED] Demo provider created: ${(provider as any).providerId}`);
        }
      };

      if (result && typeof (result as any).then === 'function') {
        (result as unknown as Promise<any>).then(handleResult).catch((error: unknown) => {
          console.warn('[SEED] Demo provider seed skipped:', error instanceof Error ? error.message : error);
        });
      } else {
        handleResult(result as any);
      }
    } catch (error) {
      console.warn('[SEED] Demo provider seed skipped:', error instanceof Error ? error.message : error);
    }
  }

  // ── CQC Intelligence Endpoints (Feature 1) ──────────────────────────

  app.get('/v1/providers/:providerId/cqc-intelligence', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId }).strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };

    const alerts = await store.listCqcAlerts(ctx, providerId);

    // Sort: severity DESC (HIGH first), then date DESC
    const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sorted = [...alerts].sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return b.reportDate.localeCompare(a.reportDate);
    });

    const riskCount = sorted.filter((a) => a.intelligenceType === 'RISK_SIGNAL').length;
    const outstandingCount = sorted.filter((a) => a.intelligenceType === 'OUTSTANDING_SIGNAL').length;

    sendWithMetadata(res, {
      alerts: sorted.map((a) => ({
        id: a.id,
        intelligenceType: a.intelligenceType,
        sourceLocationName: a.sourceLocationName,
        sourceServiceType: a.sourceServiceType,
        reportDate: a.reportDate,
        keyQuestion: a.keyQuestion,
        qualityStatementId: a.qualityStatementId,
        qualityStatementTitle: a.qualityStatementTitle,
        findingText: a.findingText,
        providerCoveragePercent: a.providerCoveragePercent,
        severity: a.severity,
        createdAt: a.createdAt,
      })),
      summary: { riskCount, outstandingCount },
    });
  });

  app.post('/v1/providers/:providerId/cqc-intelligence/:alertId/dismiss', async (req, res) => {
    const ctx = getContext(req);
    const parsed = validateRequest(req, res, {
      params: z.object({ providerId: zProviderId, alertId: z.string().min(1) }).strip(),
    });
    if (!parsed) return;
    const { alertId } = parsed.params as { alertId: string };

    const alert = await store.getCqcAlertById(ctx, alertId);
    if (!alert) {
      sendError(res, 404, 'Alert not found');
      return;
    }

    await store.dismissCqcAlert(ctx, alertId);
    sendWithMetadata(res, { dismissed: true });
  });

  app.post('/v1/cqc-intelligence/poll', async (req, res) => {
    const ctx = getContext(req);

    // Get all providers for this tenant
    const providers = await store.listProviders(ctx);
    if (providers.length === 0) {
      sendError(res, 404, 'No providers found');
      return;
    }

    // Use first provider (single-provider assumption for now)
    const provider = providers[0];
    const providerId = provider.providerId;

    // Debounce: check last poll time
    const pollState = await store.getPollState(ctx, providerId);
    if (pollState) {
      const lastPolledAt = new Date(pollState.lastPolledAt);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (lastPolledAt > oneHourAgo) {
        const retryAfter = Math.ceil((lastPolledAt.getTime() + 60 * 60 * 1000 - Date.now()) / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        sendError(res, 429, `Poll debounced. Last polled at ${pollState.lastPolledAt}. Retry after ${retryAfter}s.`);
        return;
      }
    }

    // Get all facilities to extract service types
    const facilities = await store.listFacilitiesByProvider(ctx, providerId);
    const serviceTypes = new Set(facilities.map((f) => f.serviceType.toLowerCase()));
    const facilityIds = facilities.map((f) => f.id);

    // Map service types to CQC search filters
    // CQC API supports: careHome=Y for residential care
    const serviceFilter = 'careHome=Y'; // Default filter — most providers are care homes

    // Fetch a sample of CQC locations matching service type
    const locationsResult = await fetchCqcLocations({
      serviceFilter,
      apiKey: process.env.CQC_API_KEY,
      samplePages: 2,
      perPage: 20,
    });

    if (!locationsResult.success) {
      console.error('[CQC Intelligence] Location search failed:', locationsResult.error);
      sendError(res, 502, `CQC API error: ${locationsResult.error}`);
      return;
    }

    // Get existing alert keys for deduplication
    const existingAlerts = await store.listCqcAlerts(ctx, providerId);
    const existingKeys = new Set(existingAlerts.map((a) =>
      `${a.sourceLocationId}:${a.qualityStatementId}:${a.reportDate}`
    ));

    // Compute provider's SAF34 coverage
    const perQualityStatement: Record<string, number> = {};
    const perKeyQuestion: Record<string, number> = {};
    for (const qs of SAF_34_QUALITY_STATEMENTS) {
      perQualityStatement[qs.id] = 0; // Default to 0% — real coverage would come from evidence mapping
    }

    const coverage: ProviderCoverageForIntelligence = {
      perQualityStatement,
      perKeyQuestion: perKeyQuestion as any,
    };

    let totalAlertsGenerated = 0;
    let locationsProcessed = 0;
    let locationsSkipped = 0;
    const allNewAlerts: any[] = [];

    // Batch cap: process at most 15 locations per poll
    const locationSample = locationsResult.locations.slice(0, 15);

    for (const loc of locationSample) {
      try {
        // Fetch location detail to check ratings
        const detailResult = await fetchCqcLocationDetail(loc.locationId, {
          apiKey: process.env.CQC_API_KEY,
        });

        if (!detailResult.success) {
          locationsSkipped++;
          continue;
        }

        // Only process locations with noteworthy ratings (Outstanding, RI, Inadequate)
        const noteworthy = getNoteworthy(detailResult.detail);
        if (noteworthy.length === 0) {
          locationsSkipped++;
          continue;
        }

        // Scrape the full report for findings text
        const scrapeResult = await scrapeLatestReport(loc.locationId, {
          timeoutMs: 10000,
        });

        if (!scrapeResult.success) {
          // Still generate alerts from ratings alone (without findings text)
          locationsProcessed++;
          const report = scrapeResult.report;
          // Build key question ratings from detail
          const kqRatings: Record<string, string> = {};
          for (const n of noteworthy) {
            const kqKey = n.keyQuestion.toLowerCase().replace('_', '');
            // Map WELL_LED → wellLed
            const key = n.keyQuestion === 'WELL_LED' ? 'wellLed' : kqKey;
            kqRatings[key] = n.rating;
          }

          const reportForIntelligence: CqcReportForIntelligence = {
            locationId: loc.locationId,
            locationName: detailResult.detail.locationName || loc.locationName,
            serviceType: detailResult.detail.type,
            reportDate: detailResult.detail.lastInspection?.date || new Date().toISOString(),
            keyQuestionRatings: kqRatings,
            keyQuestionFindings: {},
          };

          const alerts = generateAlerts({
            tenantId: ctx.tenantId,
            providerId,
            facilityIds,
            report: reportForIntelligence,
            coverage,
          });

          const deduped = deduplicateAlerts(alerts, existingKeys);
          allNewAlerts.push(...deduped);
          for (const alert of deduped) {
            existingKeys.add(alertDeduplicationKey(alert));
          }
          continue;
        }

        locationsProcessed++;
        const report = scrapeResult.report;

        const reportForIntelligence: CqcReportForIntelligence = {
          locationId: loc.locationId,
          locationName: detailResult.detail.locationName || loc.locationName,
          serviceType: detailResult.detail.type,
          reportDate: report.reportDate || detailResult.detail.lastInspection?.date || new Date().toISOString(),
          keyQuestionRatings: report.keyQuestionRatings as any,
          keyQuestionFindings: report.keyQuestionFindings as any,
        };

        const alerts = generateAlerts({
          tenantId: ctx.tenantId,
          providerId,
          facilityIds,
          report: reportForIntelligence,
          coverage,
        });

        const deduped = deduplicateAlerts(alerts, existingKeys);
        allNewAlerts.push(...deduped);

        // Update existing keys to avoid duplicates from later locations in this batch
        for (const alert of deduped) {
          existingKeys.add(alertDeduplicationKey(alert));
        }
      } catch (err) {
        console.error(`[CQC Intelligence] Error processing ${loc.locationId}:`, err);
        locationsSkipped++;
      }
    }

    // Cap at 20 alerts
    const capped = capAlerts(allNewAlerts, 20);

    // Persist alerts
    for (const alert of capped) {
      await store.createCqcAlert(ctx, {
        ...alert,
        facilityIds: JSON.stringify(alert.facilityIds),
      });
    }
    totalAlertsGenerated = capped.length;

    // Track usage event
    if (totalAlertsGenerated > 0) {
      await store.createUsageEvent(ctx, {
        providerId,
        eventType: 'INTELLIGENCE_POLL',
        metadata: { alertsGenerated: totalAlertsGenerated, locationsProcessed },
      });
    }

    // Update poll state
    await store.updatePollState(ctx, providerId, new Date().toISOString());

    sendWithMetadata(res, {
      alertsGenerated: totalAlertsGenerated,
      locationsProcessed,
      locationsSkipped,
    });
  });

//  Global Express error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[API] Unhandled route error:', err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({ ...buildConstitutionalMetadata(), error: 'Internal server error' });
  }
});

  return { app, store };
}
