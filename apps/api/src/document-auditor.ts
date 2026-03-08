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
  [EvidenceType.ROTA]: 'SIGN_IN_OUT',
  [EvidenceType.SKILLS_MATRIX]: 'TRAINING_MATRIX',
  [EvidenceType.SUPERVISION]: 'SUPERVISION_RECORD',
  [EvidenceType.CERTIFICATE]: 'CERTIFICATE',
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
    anthropicClient = new Anthropic({ apiKey });
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

const AUDIT_PROMPTS: Record<string, string> = {
  MAR_CHART: 'Audit MAR chart vs Reg12 SAF34. Two CD sigs, no gaps, PRN, allergy, dates, dose/route/time. JSON only: {"documentType":"MAR_CHART","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"S2.1","name":"Medicines","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  CARE_PLAN: 'Audit Care Plan vs Care Act 2014 KLOEs. Person-centred, MCA, consent, risk, cultural, review dates. JSON only: {"documentType":"CARE_PLAN","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  RISK_ASSESSMENT: 'Audit Risk Assessment vs Reg12. Hazards, scoring, controls, review, sig. JSON only: {"documentType":"RISK_ASSESSMENT","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  INCIDENT_REPORT: 'Audit Incident Report vs Reg20. Description, datetime, witnesses, actions, notifications, learning. JSON only: {"documentType":"INCIDENT_REPORT","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  AUDIT_REPORT: 'Audit internal audit report vs Reg17 and Reg12. Scope, sample size, actions, owners, target dates, and evidence of follow-up. JSON only: {"documentType":"AUDIT_REPORT","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  DAILY_NOTES: 'Audit Daily Notes vs Reg17. Person-centred, factual, timed+signed, wellbeing, escalation. JSON only: {"documentType":"DAILY_NOTES","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  HANDOVER_NOTES: 'Audit Handover Notes vs Reg12. All residents, priorities, med changes, tasks, safeguarding. JSON only: {"documentType":"HANDOVER_NOTES","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  SIGN_IN_OUT: 'Audit rota or sign-in-out record vs Reg18 and safe staffing controls. Coverage, dates, roles, gaps, signatures, and handover accountability. JSON only: {"documentType":"SIGN_IN_OUT","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  SUPERVISION_RECORD: 'Audit Supervision Record vs Reg18. Frequency, topics, target dates, signed, safeguarding. JSON only: {"documentType":"SUPERVISION_RECORD","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  TRAINING_MATRIX: 'Audit training matrix vs Reg18. Mandatory courses, expiry dates, coverage gaps, competency evidence, and escalation. JSON only: {"documentType":"TRAINING_MATRIX","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  MEDICATION_PROTOCOL: 'Audit Med Protocol vs Reg12 NICE. CDs, storage, admin, competency, disposal, audit trail. JSON only: {"documentType":"MEDICATION_PROTOCOL","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  POLICY_DOCUMENT: 'Audit policy or procedure document vs Reg17 and Reg12. Versioning, approval, review dates, scope, responsibilities, and operational detail. JSON only: {"documentType":"POLICY_DOCUMENT","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[{"id":"","name":"","rating":"MET|PARTIALLY_MET|NOT_MET","evidence":""}],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  CQC_REPORT: 'Review CQC inspection report for compliance themes, recurring concerns, action priorities, and evidence gaps. JSON only: {"documentType":"CQC_REPORT","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  CERTIFICATE: 'Review certificate for issuer, owner, dates, expiry, scope, and any missing validation detail. JSON only: {"documentType":"CERTIFICATE","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
  OTHER: 'Review care home doc vs CQC Regs 9-20. Compliance concerns, missing sigs, gaps. JSON only: {"documentType":"OTHER","auditDate":"","overallResult":"PASS|NEEDS_IMPROVEMENT|CRITICAL_GAPS","complianceScore":0,"safStatements":[],"findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW","category":"","description":"","regulation":""}],"corrections":[{"finding":"","correction":"","policyReference":"","priority":"IMMEDIATE|THIS_WEEK|THIS_MONTH"}],"summary":""}',
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

    if (isPdf) {
      const b64 = fileBuffer.toString('base64');
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } as any },
        { type: 'text', text: facilityPrefix + prompt },
      ];
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
      max_tokens: 2000,
      messages: [{ role: 'user', content: messageContent }],
    });
    const parsed = parseAuditPayload(extractResponseText(response));

    if (!isMeaningfulAuditPayload(parsed)) {
      throw new DocumentAuditExecutionError(
        'FAILED',
        'Audit response could not be parsed into a valid result.'
      );
    }

    return normalizeAuditResult(parsed, docType);
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
  fileName: string;
  mimeType: string;
  evidenceType?: string;
}): Promise<DocumentAuditSummary> {
  const documentType = detectDocumentType(params.fileName, params.mimeType, params.evidenceType);

  try {
    const result = await auditDocument(
      documentType,
      getBlobPath(params.blobHash),
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
