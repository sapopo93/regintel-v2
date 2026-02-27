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
  downloadPdfReport,
  buildCqcReportSummary,
  isWebsiteReportNewer,
} from '@regintel/domain/cqc-scraper';
import { EvidenceType, getAllRequiredEvidenceTypes } from '@regintel/domain/evidence-types';
import { fetchCqcLocation } from '@regintel/domain/cqc-client';
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

const useDbStore =
  process.env.USE_DB_STORE === 'true' ||
  (process.env.NODE_ENV !== 'test' && process.env.USE_DB_STORE !== 'false');
const store = useDbStore ? new PrismaStore() : new InMemoryStore();

// Queue adapters (BullMQ with in-memory fallback)
const scrapeReportQueue = getQueueAdapter(QUEUE_NAMES.SCRAPE_REPORT);
const malwareScanQueue = getQueueAdapter(QUEUE_NAMES.MALWARE_SCAN);
const evidenceProcessQueue = getQueueAdapter(QUEUE_NAMES.EVIDENCE_PROCESS);
const aiInsightQueue = getQueueAdapter(QUEUE_NAMES.AI_INSIGHT);

// In-memory job indexes (fallback only)
const blobScanJobs = new Map<string, string>();
const evidenceProcessJobs = new Map<string, string>();
const mockInsightJobs = new Map<string, string>();

const TOPICS = [
  {
    id: 'safe-care-treatment',
    title: 'Safe Care and Treatment',
    regulationSectionId: 'Reg 12(2)(a)',
    evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'staffing',
    title: 'Staffing',
    regulationSectionId: 'Reg 18(1)',
    evidenceRequirements: [EvidenceType.ROTA, EvidenceType.SKILLS_MATRIX, EvidenceType.SUPERVISION],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
];

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
]);

type ExportFormat = 'CSV' | 'PDF' | 'BLUE_OCEAN' | 'BLUE_OCEAN_BOARD' | 'BLUE_OCEAN_AUDIT';

function normalizeExportFormat(format: unknown): ExportFormat {
  if (format === 'CSV' || format === 'PDF') return format;
  if (format === 'BLUE_OCEAN_AUDIT') return 'BLUE_OCEAN_AUDIT';
  if (format === 'BLUE_OCEAN_BOARD' || format === 'BLUE_OCEAN') return 'BLUE_OCEAN_BOARD';
  return 'PDF';
}

function getExportExtension(format: ExportFormat): string {
  if (format === 'CSV') return 'csv';
  if (format === 'PDF') return 'pdf';
  return 'md';
}

function getBlueOceanFilename(exportId: string, format: ExportFormat): string {
  const suffix = format === 'BLUE_OCEAN_AUDIT' ? 'audit' : 'board';
  return `${exportId}.blue-ocean.${suffix}.md`;
}

function getContext(req: express.Request): TenantContext {
  return { tenantId: req.auth.tenantId, actorId: req.auth.actorId };
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

function mapEvidenceRecord(record: EvidenceRecordRecord) {
  return {
    evidenceRecordId: record.id,
    providerId: record.providerId,
    facilityId: record.facilityId,
    blobHash: record.blobHash,
    mime: record.mimeType,
    size: record.sizeBytes,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    evidenceType: record.evidenceType,
    fileName: record.fileName,
    description: record.description,
    uploadedAt: record.uploadedAt,
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

export function createApp(): express.Express {
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
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
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
  app.post('/webhooks/clerk', express.json(), handleClerkWebhook);

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
    await store.appendAuditEvent(ctx, provider.providerId, 'PROVIDER_CREATED', { providerId: provider.providerId });
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

    const facilityEvidence = await store.listEvidenceByFacility(ctx, facilityId);
    const hasCqcReport = facilityEvidence.some((record) => record.evidenceType === EvidenceType.CQC_REPORT);

    // Calculate evidence coverage based on all required types
    const evidenceTypesPresent = new Set(facilityEvidence.map((r) => r.evidenceType));
    const allRequiredTypes = getAllRequiredEvidenceTypes();
    const matchedTypes = allRequiredTypes.filter((type) => evidenceTypesPresent.has(type));
    const evidenceCoverage = allRequiredTypes.length > 0
      ? Math.round((matchedTypes.length / allRequiredTypes.length) * 100)
      : 0;

    const reportContext = await resolveReportContextForFacility(ctx, providerId, facilityId);

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
      topicsCompleted,
      totalTopics: TOPICS.length,
      unansweredQuestions,
      openFindings,
    }, reportContext);
  });

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

    let completionStatus = TOPICS.reduce<Record<string, { completed: number; total: number }>>(
      (acc, topic) => {
        acc[topic.id] = { completed: 0, total: 1 };
        return acc;
      },
      {}
    );

    if (!reportContext || reportContext.mode === 'MOCK') {
      const sessions = (await store.listSessionsByProvider(ctx, providerId))
        .filter((session) => !facilityId || session.facilityId === facilityId);
      completionStatus = TOPICS.reduce<Record<string, { completed: number; total: number }>>(
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

    sendWithMetadata(res, { topics: TOPICS, completionStatus }, reportContext);
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

    const metadata = buildConstitutionalMetadata();
    const session = await store.createMockSession(ctx, {
      provider,
      facilityId,
      topicId,
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

    const impactScore = 80;
    const likelihoodScore = 90;
    const finding = await store.addFinding(ctx, {
      providerId,
      facilityId: session.facilityId,
      sessionId,
      regulationSectionId: topic?.regulationSectionId ?? 'Reg 12(2)(a)',
      topicId: session.topicId,
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'HIGH',
      impactScore,
      likelihoodScore,
      compositeRiskScore: computeCompositeRiskScore(impactScore, likelihoodScore),
      title: 'Mock finding generated',
      description: `Automated mock finding from answer: ${answer.slice(0, 120)}`,
      evidenceRequired,
      evidenceProvided,
      evidenceMissing,
    });

    await store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_ANSWERED', {
      sessionId,
      answerLength: answer.length,
    });
    await store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_COMPLETED', {
      sessionId,
      findingId: finding.id,
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

        mockInsightJobs.set(sessionId, job.id);
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
    const mapped = evidence.map(mapEvidenceRecord);
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

      blobScanJobs.set(blobMetadata.contentHash, scanJob.id);

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

      // Return response with onboarding metadata
      sendWithMetadata(res, {
        facility,
        cqcData: onboardingResult.cqcData,
        isNew,
        dataSource: facility.dataSource,
        syncedAt: facility.cqcSyncedAt,
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
        })
        .strip(),
    });
    if (!parsed) return;
    const { facilityId } = parsed.params as { facilityId: string };
    const { blobHash, evidenceType, fileName, description } = parsed.body as {
      blobHash: string;
      evidenceType: EvidenceType;
      fileName: string;
      description?: string;
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
      });

      await store.appendAuditEvent(ctx, facility.providerId, 'EVIDENCE_RECORDED', {
        facilityId,
        evidenceRecordId: record.id,
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

      evidenceProcessJobs.set(record.id, processJob.id);

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
          record: mapEvidenceRecord(record),
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
    const mapped = evidence.map(mapEvidenceRecord);
    const reportContext = await resolveReportContextForFacility(ctx, facility.providerId, facilityId);
    sendWithMetadata(res, { evidence: mapped, totalCount: mapped.length }, reportContext);
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

    const availableFormats = reportContext?.mode === 'REAL'
      ? ['BLUE_OCEAN_BOARD', 'BLUE_OCEAN_AUDIT']
      : ['CSV', 'PDF', 'BLUE_OCEAN_BOARD', 'BLUE_OCEAN_AUDIT'];

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
          downloadUrl: `${req.protocol}://${req.get('host')}/v1/exports/${latestExport.id}.${getExportExtension(latestExport.format)}`
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
      });

      const fileExtension = getExportExtension(safeFormat);
      const downloadUrl = `${req.protocol}://${req.get('host')}/v1/exports/${exportRecord.id}.${fileExtension}`;

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
    });

    const fileExtension = getExportExtension(safeFormat);
    const downloadUrl = `${req.protocol}://${req.get('host')}/v1/exports/${exportRecord.id}.${fileExtension}`;

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
        exportRecord.format !== 'BLUE_OCEAN_AUDIT')
    ) {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${getBlueOceanFilename(exportRecord.id, exportRecord.format)}"`
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
    const providerId = job.providerId || '';

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

      // Download PDF if available
      if (report.pdfUrl) {
        const pdfResult = await downloadPdfReport(report.pdfUrl);
        if (pdfResult.success) {
          const contentBase64 = pdfResult.contentBase64;
          await store.createEvidenceBlob(ctx, {
            contentBase64,
            mimeType: 'application/pdf',
          });

          const pdfBuffer = Buffer.from(contentBase64, 'base64');
          const blobMetadata = await blobStorage.upload(pdfBuffer, 'application/pdf');

          await store.createEvidenceRecord(ctx, {
            facilityId,
            providerId,
            blobHash: blobMetadata.contentHash,
            evidenceType: EvidenceType.CQC_REPORT,
            fileName: `CQC-Report-${report.reportDate || 'latest'}.pdf`,
            description: `CQC inspection report (${summary.rating || report.rating})`,
          });
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

  return app;
}
