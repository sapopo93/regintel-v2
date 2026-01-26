import express from 'express';
import cors from 'cors';
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
import { generateBlueOceanReport } from '@regintel/domain/blue-ocean-report';
import {
  serializeBlueOceanBoardMarkdown,
  serializeBlueOceanAuditMarkdown,
} from '@regintel/domain/blue-ocean-renderers';
import { computeProvenanceHash, computeCompositeRiskScore } from '@regintel/domain/inspection-finding';
import type { Action } from '@regintel/domain/action';
import { onboardFacility } from '@regintel/domain/onboarding';
import { scrapeLatestReport, downloadPdfReport } from '@regintel/domain/cqc-scraper';
import { buildConstitutionalMetadata } from './metadata';
import { authMiddleware } from './auth';
import { InMemoryStore, type TenantContext, type EvidenceRecordRecord } from './store';

const store = new InMemoryStore();

// Simple background job queue (in-memory for now)
interface BackgroundJob {
  id: string;
  type: 'SCRAPE_LATEST_REPORT' | 'BASELINE_CREATION';
  facilityId: string;
  cqcLocationId: string;
  tenantId: string;
  providerId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  error?: string;
}

const backgroundJobs: BackgroundJob[] = [];

const TOPICS = [
  {
    id: 'safe-care-treatment',
    title: 'Safe Care and Treatment',
    regulationSectionId: 'Reg 12(2)(a)',
    evidenceRequirements: ['Policy', 'Training', 'Audit'],
    questionMode: 'evidence_first' as const,
    maxFollowUps: 4,
  },
  {
    id: 'staffing',
    title: 'Staffing',
    regulationSectionId: 'Reg 18(1)',
    evidenceRequirements: ['Rota', 'Skills Matrix', 'Supervision Records'],
    questionMode: 'narrative_first' as const,
    maxFollowUps: 3,
  },
];

const SERVICE_TYPES = new Set([
  'residential',
  'nursing',
  'domiciliary',
  'supported_living',
  'hospice',
]);

const CQC_LOCATION_ID_PATTERN = /^1-[0-9]{9,11}$/;

function isValidCqcLocationId(id: string): boolean {
  return CQC_LOCATION_ID_PATTERN.test(id.trim());
}

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

function sendWithMetadata(res: express.Response, payload: Record<string, unknown>): void {
  res.json({ ...buildConstitutionalMetadata(), ...payload });
}

function sendError(res: express.Response, status: number, message: string): void {
  res.status(status).json({ ...buildConstitutionalMetadata(), error: message });
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
    maxTotalQuestions: 10,
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

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/v1', authMiddleware);

  app.get('/v1/providers', (req, res) => {
    const ctx = getContext(req);
    const providers = store.listProviders(ctx);
    sendWithMetadata(res, { providers });
  });

  app.post('/v1/providers', (req, res) => {
    const ctx = getContext(req);
    const { providerName, orgRef } = req.body ?? {};

    if (!providerName || typeof providerName !== 'string') {
      sendError(res, 400, 'providerName is required');
      return;
    }

    const provider = store.createProvider(ctx, { providerName: providerName.trim(), orgRef });
    store.appendAuditEvent(ctx, provider.providerId, 'PROVIDER_CREATED', { providerId: provider.providerId });
    sendWithMetadata(res, { provider });
  });

  app.get('/v1/providers/:providerId/overview', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const facilityId = req.query.facility as string | undefined;

    if (!facilityId) {
      sendError(res, 400, 'facility query param is required');
      return;
    }

    const provider = store.getProviderById(ctx, providerId);
    const facility = store.getFacilityById(ctx, facilityId);

    if (!provider || !facility || facility.providerId !== providerId) {
      sendError(res, 404, 'Provider or facility not found');
      return;
    }

    const facilityEvidence = store.listEvidenceByFacility(ctx, facilityId);
    const hasCqcReport = facilityEvidence.some((record) => record.evidenceType === 'CQC_REPORT');
    const evidenceCoverage = hasCqcReport ? 100 : 0;

    const sessions = store.listSessionsByProvider(ctx, providerId)
      .filter((session) => session.facilityId === facilityId);
    const completedSessions = sessions.filter((session) => session.status === 'COMPLETED');
    const openFindings = store.listFindingsByProvider(ctx, providerId)
      .filter((finding) => finding.facilityId === facilityId).length;

    sendWithMetadata(res, {
      provider,
      facility,
      evidenceCoverage,
      topicsCompleted: completedSessions.length,
      totalTopics: TOPICS.length,
      unansweredQuestions: sessions.filter((session) => session.status === 'IN_PROGRESS').length,
      openFindings,
    });
  });

  app.get('/v1/providers/:providerId/topics', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const facilityId = req.query.facility as string | undefined;

    const provider = store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }

    const sessions = store.listSessionsByProvider(ctx, providerId)
      .filter((session) => !facilityId || session.facilityId === facilityId);

    const completionStatus = TOPICS.reduce<Record<string, { completed: number; total: number }>>(
      (acc, topic) => {
        const completed = sessions.filter(
          (session) => session.topicId === topic.id && session.status === 'COMPLETED'
        ).length;
        acc[topic.id] = { completed, total: 1 };
        return acc;
      },
      {}
    );

    sendWithMetadata(res, { topics: TOPICS, completionStatus });
  });

  app.get('/v1/providers/:providerId/topics/:topicId', (req, res) => {
    const { topicId } = req.params;
    const topic = TOPICS.find((item) => item.id === topicId);
    if (!topic) {
      sendError(res, 404, 'Topic not found');
      return;
    }
    sendWithMetadata(res, topic);
  });

  app.get('/v1/providers/:providerId/mock-sessions', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const facilityId = req.query.facility as string | undefined;

    const sessions = store.listSessionsByProvider(ctx, providerId)
      .filter((session) => !facilityId || session.facilityId === facilityId);
    sendWithMetadata(res, { sessions });
  });

  app.post('/v1/providers/:providerId/mock-sessions', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const { topicId, facilityId } = req.body ?? {};

    if (!topicId || !facilityId) {
      sendError(res, 400, 'topicId and facilityId are required');
      return;
    }

    const provider = store.getProviderById(ctx, providerId);
    const facility = store.getFacilityById(ctx, facilityId);
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
    const session = store.createMockSession(ctx, {
      provider,
      facilityId,
      topicId,
      topicCatalogVersion: metadata.topicCatalogVersion,
      topicCatalogHash: metadata.topicCatalogHash,
      prsLogicProfilesVersion: metadata.prsLogicVersion,
      prsLogicProfilesHash: metadata.prsLogicHash,
    });

    store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_STARTED', {
      sessionId: session.sessionId,
      facilityId,
      topicId,
    });

    sendWithMetadata(res, session);
  });

  app.get('/v1/providers/:providerId/mock-sessions/:sessionId', (req, res) => {
    const ctx = getContext(req);
    const { providerId, sessionId } = req.params;
    const session = store.getSessionById(ctx, sessionId);

    if (!session || session.providerId !== providerId) {
      sendError(res, 404, 'Session not found');
      return;
    }

    sendWithMetadata(res, session);
  });

  app.post('/v1/providers/:providerId/mock-sessions/:sessionId/answer', (req, res) => {
    const ctx = getContext(req);
    const { providerId, sessionId } = req.params;
    const { answer } = req.body ?? {};

    if (!answer || typeof answer !== 'string') {
      sendError(res, 400, 'answer is required');
      return;
    }

    const session = store.getSessionById(ctx, sessionId);
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

    store.updateSession(ctx, updated);

    const topic = TOPICS.find((item) => item.id === session.topicId);
    const evidenceRequired = topic?.evidenceRequirements ?? [];
    const facilityEvidence = store.listEvidenceByFacility(ctx, session.facilityId);
    const evidenceProvided = facilityEvidence.map((record) => record.evidenceType);
    const evidenceMissing = evidenceRequired.filter(
      (required) => !evidenceProvided.includes(required)
    );

    const finding = store.addFinding(ctx, {
      providerId,
      facilityId: session.facilityId,
      sessionId,
      regulationSectionId: topic?.regulationSectionId ?? 'Reg 12(2)(a)',
      topicId: session.topicId,
      origin: 'SYSTEM_MOCK',
      reportingDomain: 'MOCK_SIMULATION',
      severity: 'HIGH',
      compositeRiskScore: 72,
      title: 'Mock finding generated',
      description: `Automated mock finding from answer: ${answer.slice(0, 120)}`,
      evidenceRequired,
      evidenceProvided,
      evidenceMissing,
    });

    store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_ANSWERED', {
      sessionId,
      answerLength: answer.length,
    });
    store.appendAuditEvent(ctx, providerId, 'MOCK_SESSION_COMPLETED', {
      sessionId,
      findingId: finding.id,
    });

    sendWithMetadata(res, updated);
  });

  app.get('/v1/providers/:providerId/findings', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const facilityId = req.query.facility as string | undefined;

    const findings = store.listFindingsByProvider(ctx, providerId)
      .filter((finding) => !facilityId || finding.facilityId === facilityId);
    sendWithMetadata(res, { findings, totalCount: findings.length });
  });

  app.get('/v1/providers/:providerId/findings/:findingId', (req, res) => {
    const ctx = getContext(req);
    const { providerId, findingId } = req.params;
    const finding = store.getFindingById(ctx, findingId);

    if (!finding || finding.providerId !== providerId) {
      sendError(res, 404, 'Finding not found');
      return;
    }

    sendWithMetadata(res, {
      finding,
      regulationText:
        'Regulation 12(2)(a): Care and treatment must be provided in a safe way for service users.',
    });
  });

  app.get('/v1/providers/:providerId/evidence', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const facilityId = req.query.facility as string | undefined;

    const evidence = facilityId
      ? store.listEvidenceByFacility(ctx, facilityId)
      : store.listEvidenceByProvider(ctx, providerId);
    const mapped = evidence.map(mapEvidenceRecord);
    sendWithMetadata(res, { evidence: mapped, totalCount: mapped.length });
  });

  app.post('/v1/evidence/blobs', (req, res) => {
    const ctx = getContext(req);
    const { contentBase64, mimeType } = req.body ?? {};

    if (!contentBase64 || !mimeType) {
      sendError(res, 400, 'contentBase64 and mimeType are required');
      return;
    }

    const blob = store.createEvidenceBlob(ctx, { contentBase64, mimeType });
    sendWithMetadata(res, blob);
  });

  app.post('/v1/providers/:providerId/facilities', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const {
      facilityName,
      addressLine1,
      townCity,
      postcode,
      cqcLocationId,
      serviceType,
      capacity,
    } = req.body ?? {};

    if (
      !facilityName ||
      !addressLine1 ||
      !townCity ||
      !postcode ||
      !cqcLocationId ||
      !serviceType
    ) {
      sendError(res, 400, 'Missing required facility fields');
      return;
    }

    if (!isValidCqcLocationId(cqcLocationId)) {
      sendError(res, 400, 'Invalid CQC Location ID format (1-123456789 or 1-1234567890)');
      return;
    }

    if (!SERVICE_TYPES.has(serviceType)) {
      sendError(res, 400, 'Invalid serviceType');
      return;
    }

    try {
      const facility = store.createFacility(ctx, {
        providerId,
        facilityName: facilityName.trim(),
        addressLine1: addressLine1.trim(),
        townCity: townCity.trim(),
        postcode: postcode.trim(),
        cqcLocationId: cqcLocationId.trim(),
        serviceType: serviceType.trim(),
        capacity: typeof capacity === 'number' ? capacity : undefined,
      });
      store.appendAuditEvent(ctx, providerId, 'FACILITY_CREATED', {
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

  app.get('/v1/providers/:providerId/facilities', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const provider = store.getProviderById(ctx, providerId);
    if (!provider) {
      sendError(res, 404, 'Provider not found');
      return;
    }
    const facilities = store.listFacilitiesByProvider(ctx, providerId);
    sendWithMetadata(res, { provider, facilities, totalCount: facilities.length });
  });

  app.get('/v1/facilities', (req, res) => {
    const ctx = getContext(req);
    const facilities = store.listFacilities(ctx);
    sendWithMetadata(res, { facilities, totalCount: facilities.length });
  });

  app.get('/v1/facilities/:facilityId', (req, res) => {
    const ctx = getContext(req);
    const { facilityId } = req.params;
    const facility = store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }
    const provider = store.getProviderById(ctx, facility.providerId);
    sendWithMetadata(res, { facility, provider });
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
    const {
      providerId,
      cqcLocationId,
      facilityName,
      addressLine1,
      townCity,
      postcode,
      serviceType,
      capacity,
    } = req.body ?? {};

    // Validate required fields
    if (!providerId || !cqcLocationId) {
      sendError(res, 400, 'providerId and cqcLocationId are required');
      return;
    }

    // Validate CQC Location ID format
    if (!isValidCqcLocationId(cqcLocationId)) {
      sendError(res, 400, 'Invalid CQC Location ID format (expected: 1-XXXXXXXXX with 9-11 digits)');
      return;
    }

    // Validate provider exists
    const provider = store.getProviderById(ctx, providerId);
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
      const { facility, isNew } = store.upsertFacility(ctx, {
        ...onboardingResult.facilityData,
        providerId,
      });

      // Audit the event
      const eventType = isNew ? 'FACILITY_ONBOARDED' : 'FACILITY_UPDATED';
      store.appendAuditEvent(ctx, providerId, eventType, {
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

  app.post('/v1/facilities/:facilityId/evidence', (req, res) => {
    const ctx = getContext(req);
    const { facilityId } = req.params;
    const { blobHash, evidenceType, fileName, description } = req.body ?? {};

    if (!blobHash || !evidenceType || !fileName) {
      sendError(res, 400, 'blobHash, evidenceType, and fileName are required');
      return;
    }

    const facility = store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    try {
      const record = store.createEvidenceRecord(ctx, {
        facilityId,
        providerId: facility.providerId,
        blobHash,
        evidenceType,
        fileName,
        description,
      });

      store.appendAuditEvent(ctx, facility.providerId, 'EVIDENCE_RECORDED', {
        facilityId,
        evidenceRecordId: record.id,
      });

      sendWithMetadata(res, { record: mapEvidenceRecord(record) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evidence record failed';
      sendError(res, 400, message);
    }
  });

  app.get('/v1/facilities/:facilityId/evidence', (req, res) => {
    const ctx = getContext(req);
    const { facilityId } = req.params;
    const facility = store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }
    const evidence = store.listEvidenceByFacility(ctx, facilityId);
    const mapped = evidence.map(mapEvidenceRecord);
    sendWithMetadata(res, { evidence: mapped, totalCount: mapped.length });
  });

  app.get('/v1/providers/:providerId/exports', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const facilityId = req.query.facility as string | undefined;

    // Get actual exports from store
    const exports = store.listExportsByProvider(ctx, providerId, facilityId);
    const latestExport = exports[0]; // Already sorted by most recent

    sendWithMetadata(res, {
      providerId,
      availableFormats: ['CSV', 'PDF', 'BLUE_OCEAN_BOARD', 'BLUE_OCEAN_AUDIT'],
      watermark: EXPORT_WATERMARK,
      latestExport: latestExport
        ? {
            exportId: latestExport.id,
            format: latestExport.format,
            generatedAt: latestExport.createdAt,
            downloadUrl: `${req.protocol}://${req.get('host')}/v1/exports/${latestExport.id}.${getExportExtension(latestExport.format)}`
          }
        : undefined,
    });
  });

  app.post('/v1/providers/:providerId/exports', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const { format, facilityId } = req.body ?? {};

    if (!facilityId) {
      sendError(res, 400, 'facilityId is required');
      return;
    }

    const session = store.listSessionsByProvider(ctx, providerId)
      .filter((item) => item.facilityId === facilityId)
      .find((item) => item.status === 'COMPLETED');

    if (!session) {
      sendError(res, 409, 'No completed session available for export');
      return;
    }

    const findings = store.listFindingsByProvider(ctx, providerId)
      .filter((finding) => finding.sessionId === session.sessionId)
      .map<DraftFinding>((finding) => ({
        id: finding.id,
        sessionId: finding.sessionId,
        topicId: finding.topicId,
        regulationId: finding.regulationSectionId,
        regulationSectionId: finding.regulationSectionId,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        impactScore: 80,
        likelihoodScore: 90,
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
    const safeFormat = normalizeExportFormat(format);

    let content: string;
    if (safeFormat === 'CSV') {
      const csvExport = generateCsvExport(domainSession, metadata);
      content = serializeCsvExport(csvExport);
    } else if (safeFormat === 'BLUE_OCEAN_BOARD' || safeFormat === 'BLUE_OCEAN_AUDIT') {
      // Convert findings to InspectionFinding format for Blue Ocean
      const inspectionFindings = findings.map(f => {
        const provData = {
          domain: Domain.CQC,
          origin: FindingOrigin.SYSTEM_MOCK,
          reportingDomain: ReportingDomain.MOCK_SIMULATION,
          contextSnapshotId: 'snapshot-001',
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
          contextSnapshotId: 'snapshot-001',
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

      const evidenceRecords = store.listEvidenceByFacility(ctx, facilityId).map((record) => ({
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

      // Use empty actions array for now (store doesn't have actions yet)
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

    const exportRecord = store.createExport(ctx, {
      providerId,
      facilityId,
      sessionId: session.sessionId,
      format: safeFormat,
      content,
    });

    store.appendAuditEvent(ctx, providerId, 'EXPORT_GENERATED', {
      exportId: exportRecord.id,
      format: safeFormat,
    });

    const fileExtension = getExportExtension(safeFormat);
    const downloadUrl = `${req.protocol}://${req.get('host')}/v1/exports/${exportRecord.id}.${fileExtension}`;

    sendWithMetadata(res, {
      exportId: exportRecord.id,
      downloadUrl,
      expiresAt: exportRecord.expiresAt,
    });
  });

  app.get('/v1/exports/:exportId.csv', (req, res) => {
    const ctx = getContext(req);
    const exportRecord = store.getExportById(ctx, req.params.exportId);
    if (!exportRecord || exportRecord.format !== 'CSV') {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.id}.csv"`);
    res.send(exportRecord.content);
  });

  app.get('/v1/exports/:exportId.pdf', (req, res) => {
    const ctx = getContext(req);
    const exportRecord = store.getExportById(ctx, req.params.exportId);
    if (!exportRecord || exportRecord.format !== 'PDF') {
      sendError(res, 404, 'Export not found');
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.id}.pdf"`);
    res.send(exportRecord.content);
  });

  app.get('/v1/exports/:exportId.md', (req, res) => {
    const ctx = getContext(req);
    const exportRecord = store.getExportById(ctx, req.params.exportId);
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

  app.get('/v1/providers/:providerId/audit-trail', (req, res) => {
    const ctx = getContext(req);
    const { providerId } = req.params;
    const events = store.listAuditEvents(ctx, providerId);
    sendWithMetadata(res, { events, totalCount: events.length });
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
    const { providerId, cqcLocationIds, autoSyncReports = false } = req.body ?? {};

    if (!providerId || !Array.isArray(cqcLocationIds) || cqcLocationIds.length === 0) {
      sendError(res, 400, 'providerId and cqcLocationIds array are required');
      return;
    }

    if (cqcLocationIds.length > 50) {
      sendError(res, 400, 'Maximum 50 facilities per bulk onboarding request');
      return;
    }

    const provider = store.getProviderById(ctx, providerId);
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

        const { facility, isNew } = store.upsertFacility(ctx, {
          ...onboardingResult.facilityData,
          providerId,
        });

        const eventType = isNew ? 'FACILITY_ONBOARDED' : 'FACILITY_UPDATED';
        store.appendAuditEvent(ctx, providerId, eventType, {
          facilityId: facility.id,
          cqcLocationId: facility.cqcLocationId,
          dataSource: facility.dataSource,
          isNew,
          bulkOnboarding: true,
        });

        // Auto-enqueue report scraping if requested
        if (autoSyncReports) {
          const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          backgroundJobs.push({
            id: jobId,
            type: 'SCRAPE_LATEST_REPORT',
            facilityId: facility.id,
            cqcLocationId: facility.cqcLocationId,
            tenantId: ctx.tenantId,
            providerId,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
          });
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
    const { facilityId } = req.params;

    const facility = store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    // Create background job
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    backgroundJobs.push({
      id: jobId,
      type: 'SCRAPE_LATEST_REPORT',
      facilityId,
      cqcLocationId: facility.cqcLocationId,
      tenantId: ctx.tenantId,
      providerId: facility.providerId,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    // Process immediately in this demo (in production, use a job queue)
    processReportScrapeJob(jobId, ctx).catch((err) => {
      console.error('Background job failed:', err);
    });

    sendWithMetadata(res, {
      message: 'Report sync started',
      jobId,
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
    const { facilityId } = req.params;

    const facility = store.getFacilityById(ctx, facilityId);
    if (!facility) {
      sendError(res, 404, 'Facility not found');
      return;
    }

    if (facility.inspectionStatus === 'INSPECTED') {
      sendError(res, 409, 'Facility already has inspection history. Use mock inspections instead.');
      return;
    }

    // Guide: Create a baseline mock inspection for never-inspected facilities
    const provider = store.getProviderById(ctx, facility.providerId);
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
   */
  app.get('/v1/background-jobs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = backgroundJobs.find((j) => j.id === jobId);

    if (!job) {
      sendError(res, 404, 'Job not found');
      return;
    }

    sendWithMetadata(res, {
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        error: job.error,
      },
    });
  });

  /**
   * Background job processor for report scraping.
   * In production, this would be a separate worker service.
   */
  async function processReportScrapeJob(jobId: string, ctx: TenantContext) {
    const job = backgroundJobs.find((j) => j.id === jobId);
    if (!job) return;

    job.status = 'PROCESSING';

    try {
      // Scrape latest report from CQC website
      const scrapeResult = await scrapeLatestReport(job.cqcLocationId);

      if (!scrapeResult.success) {
        job.status = 'FAILED';
        job.error = scrapeResult.error.message;
        job.completedAt = new Date().toISOString();
        return;
      }

      const { report } = scrapeResult;
      const facility = store.getFacilityById(ctx, job.facilityId);

      if (!facility) {
        job.status = 'FAILED';
        job.error = 'Facility not found';
        job.completedAt = new Date().toISOString();
        return;
      }

      // Handle never-inspected facilities
      if (!report.hasReport) {
        // Update facility status
        store.upsertFacility(ctx, {
          ...facility,
          inspectionStatus: 'NEVER_INSPECTED',
          lastReportScrapedAt: new Date().toISOString(),
        });

        job.status = 'COMPLETED';
        job.completedAt = new Date().toISOString();
        return;
      }

      // Download PDF if available
      let evidenceRecordId: string | undefined;
      if (report.pdfUrl) {
        const pdfResult = await downloadPdfReport(report.pdfUrl);
        if (pdfResult.success) {
          const blob = store.createEvidenceBlob(ctx, {
            contentBase64: pdfResult.contentBase64,
            mimeType: 'application/pdf',
          });

          const evidenceRecord = store.createEvidenceRecord(ctx, {
            facilityId: job.facilityId,
            providerId: job.providerId,
            blobHash: blob.blobHash,
            evidenceType: 'CQC_REPORT',
            fileName: `CQC-Report-${report.reportDate || 'latest'}.pdf`,
            description: `CQC inspection report (${report.rating})`,
          });

          evidenceRecordId = evidenceRecord.id;
        }
      }

      // Update facility with scraped data
      store.upsertFacility(ctx, {
        ...facility,
        latestRating: report.rating || facility.latestRating,
        latestRatingDate: report.reportDate || facility.latestRatingDate,
        inspectionStatus: report.hasReport ? 'INSPECTED' : 'NEVER_INSPECTED',
        lastReportScrapedAt: new Date().toISOString(),
        lastScrapedReportDate: report.reportDate,
        lastScrapedReportUrl: report.reportUrl,
      });

      store.appendAuditEvent(ctx, job.providerId, 'REPORT_SCRAPED', {
        facilityId: job.facilityId,
        cqcLocationId: job.cqcLocationId,
        rating: report.rating,
        reportDate: report.reportDate,
        evidenceRecordId,
        hasReport: report.hasReport,
      });

      job.status = 'COMPLETED';
      job.completedAt = new Date().toISOString();
    } catch (error) {
      job.status = 'FAILED';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date().toISOString();
    }
  }

  // Seed demo data for development
  if (process.env.NODE_ENV !== 'production') {
    const demoContext: TenantContext = {
      tenantId: 'demo',
      actorId: 'SYSTEM',
    };

    const provider = store.seedDemoProvider(demoContext);

    if (provider) {
      console.log(`[SEED] Demo provider created: ${provider.providerId}`);
    }
  }

  return app;
}
