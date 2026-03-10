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
} from '@regintel/domain/readiness-export';
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
} from '@regintel/domain/inspector-evidence-pack';
import { fetchCqcLocations, fetchCqcLocationDetail, getNoteworthy } from '@regintel/domain/cqc-changes-client';
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
  saveDocumentAuditFailure,
  savePendingDocumentAudit,
  type DocumentAuditSummary,
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

function getExportExtension(format: ExportFormat): string {
  if (format === 'CSV') return 'csv';
  if (format === 'PDF') return 'pdf';
  return 'md'; // BLUE_OCEAN_*, INSPECTOR_PACK all use markdown
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

function serializePdfExport(pdfExport: ReturnType<typeof generatePdfExport>): string {
  const lines: string[] = [];
  lines.push(`# ${pdfExport.watermark}`);
  lines.push(`generatedAt=${pdfExport.generatedAt}`);
  lines.push(`totalFindings=${pdfExport.totalFindings}`);

  for (const page of pdfExport.pages) {
    lines.push(`page=${page.pageNumber}`);
    lines.push(`watermark=${page.watermark}`);
    lines.push(`topicCatalogVersion=${page.topicCatalogVersion}`);
    lines.push(`topicCatalogSha256=${page.topicCatalogSha256}`);
    lines.push(`prsLogicProfilesVersion=${page.prsLogicProfilesVersion}`);
    lines.push(`prsLogicProfilesSha256=${page.prsLogicProfilesSha256}`);
    for (const finding of page.findings) {
      lines.push(
        `finding=${finding.findingId}|${finding.severity}|${finding.compositeRiskScore}|${finding.title}`
      );
    }
  }

  return lines.join('\n');
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
    const session = await store.createMockSession(ctx, {
      provider,
      facilityId,
      topicId,
      maxFollowUps: fCtx.maxFollowUpsPerTopic,
      topicCatalogVersion: metadata.topicCatalogVersion,
      topicCatalogHash: metadata.topicCatalogHash,
      prsLogicProfilesVersion: metadata.prsLogicVersion,
      prsLogicProfilesHash: metadata.prsLogicHash,
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

    const updated: typeof session = {
      ...session,
      followUpsUsed: session.followUpsUsed + 1,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    };

    await store.updateSession(ctx, updated);

    const topic = TOPICS.find((item) => item.id === session.topicId);
    const evidenceRequired = topic?.evidenceRequirements ?? [];
    const facilityEvidence = await store.listEvidenceByFacility(ctx, session.facilityId);
    const evidenceProvided = facilityEvidence.map((record) => record.evidenceType);
    const evidenceMissing = evidenceRequired.filter(
      (required) => !evidenceProvided.includes(required)
    );
    const facility = await store.getFacilityById(ctx, session.facilityId);
    const provider = await store.getProviderById(ctx, providerId);
    const fCtx = buildFacilityContext(facility ?? {}, provider ?? {});

    const impactScore = 80;
    const likelihoodScore = 90;
    const adjusted = computeAdjustedSeverityScore(impactScore, likelihoodScore, fCtx.severityMultiplier);
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
      title: `Practice finding: ${topic?.title ?? 'Mock inspection'} (${topic?.regulationSectionId ?? 'Reg 12(2)(a)'})`,
      description: (() => {
        const prefix = `During practice inspection of ${topic?.title ?? 'this topic'}, the provider response was evaluated against ${topic?.regulationSectionId ?? 'Reg 12(2)(a)'}. Provider response summary: `;
        const maxLen = 500;
        const remaining = maxLen - prefix.length;
        const summary = remaining >= answer.length
          ? answer
          : answer.slice(0, answer.lastIndexOf(' ', remaining)) + '...';
        return prefix + summary;
      })(),
      evidenceRequired,
      evidenceProvided,
      evidenceMissing,
    });

    await store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_ANSWERED', {
      sessionId,
      answerLength: answer.length,
      followUpsUsed: updated.followUpsUsed,
    });
    await store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_COMPLETED', {
      sessionId,
      findingId: finding.id,
      findingsCount: 1,
    });

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
          question: topic?.title ? `Mock inspection topic: ${topic.title}` : 'Mock inspection topic',
          answer,
          serviceType: facility?.serviceType,
        } as AIInsightJobData);

        setBounded(mockInsightJobs, sessionId, job.id);
      } catch (error) {
        console.error('[AI_INSIGHTS] Failed to enqueue job:', error);
      }
    }

    const reportContext = resolveReportContextForSession(updated);
    sendWithMetadata(res, updated, reportContext);
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
        })
        .strip(),
    });
    if (!parsed) return;
    const { providerId } = parsed.params as { providerId: string };
    const { facilityId, format } = parsed.body as {
      facilityId: string;
      format?: string;
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

      const pack = generateInspectorEvidencePack({
        facilityName: facility.facilityName,
        facilityId: facility.id,
        inspectionStatus: facility.inspectionStatus,
        evidenceInputs,
        metadata: {
          topicCatalogVersion: metadata.topicCatalogVersion,
          topicCatalogHash: metadata.topicCatalogHash,
          prsLogicProfilesVersion: metadata.prsLogicVersion,
          prsLogicProfilesHash: metadata.prsLogicHash,
        },
        watermark: facilityReportContext.mode === 'REAL' ? null : 'PRACTICE — NOT AN OFFICIAL CQC RECORD',
      });

      const content = serializeInspectorPackMarkdown(pack);

      const exportRecord = await store.createExport(ctx, {
        providerId,
        facilityId,
        sessionId: facilityReportContext.reportSource.id,
        format: 'INSPECTOR_PACK',
        content,
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

      const fileExtension = getExportExtension(safeFormat);
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

      const evidenceRecords = (await store.listEvidenceByFacility(ctx, facilityId)).map((record) => ({
        id: record.id,
        tenantId: record.tenantId,
        blobHashes: [record.blobHash],
        primaryBlobHash: record.blobHash,
        title: record.fileName,
        description: record.description,
        evidenceType: record.evidenceType,
        supportsFindingIds: [],
        supportsPolicyIds: [],
        collectedAt: record.uploadedAt,
        collectedBy: record.createdBy,
        accessRevoked: false,
        createdAt: record.uploadedAt,
        createdBy: record.createdBy,
      }));

      const actions: Action[] = [];

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

      const content =
        safeFormat === 'BLUE_OCEAN_AUDIT'
          ? serializeBlueOceanAuditMarkdown(blueOceanReport)
          : serializeBlueOceanBoardMarkdown(blueOceanReport);

      const exportRecord = await store.createExport(ctx, {
        providerId,
        facilityId,
        sessionId: facilityReportContext.reportSource.id,
        format: safeFormat,
        content,
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

      const fileExtension = getExportExtension(safeFormat);
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

    const metadata = {
      sessionId: session.sessionId,
      providerId,
      topicCatalogVersion: session.topicCatalogVersion,
      topicCatalogSha256: topicCatalogSha,
      prsLogicProfilesVersion: session.prsLogicProfilesVersion,
      prsLogicProfilesSha256: prsLogicSha,
    };

    const domainSession = buildDomainSession(session, findings);

    let content: string;
    if (safeFormat === 'CSV') {
      const csvExport = generateCsvExport(domainSession, metadata);
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

      const evidenceRecords = (await store.listEvidenceByFacility(ctx, facilityId)).map((record) => ({
        id: record.id,
        tenantId: record.tenantId,
        blobHashes: [record.blobHash],
        primaryBlobHash: record.blobHash,
        title: record.fileName,
        description: record.description,
        evidenceType: record.evidenceType,
        supportsFindingIds: [],
        supportsPolicyIds: [],
        collectedAt: record.uploadedAt,
        collectedBy: record.createdBy,
        accessRevoked: false,
        createdAt: record.uploadedAt,
        createdBy: record.createdBy,
      }));

      const actions: Action[] = [];

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
      content =
        safeFormat === 'BLUE_OCEAN_AUDIT'
          ? serializeBlueOceanAuditMarkdown(blueOceanReport)
          : serializeBlueOceanBoardMarkdown(blueOceanReport);
    } else {
      const pdfExport = generatePdfExport(domainSession, metadata);
      content = serializePdfExport(pdfExport);
    }

    const exportRecord = await store.createExport(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      format: safeFormat,
      content,
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

    const fileExtension = getExportExtension(safeFormat);
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
    if (!exportRecord || exportRecord.format !== 'PDF') {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.id}.pdf"`);
    res.send(exportRecord.content);
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
