/**
 * Job Data Types for BullMQ Queues
 *
 * Type-safe job payloads for all background job types.
 * Each job type has:
 * - Input data (JobData)
 * - Result data (JobResult)
 * - Progress data (optional)
 */

import type { EvidenceType } from '@regintel/domain/evidence-types';

/**
 * Base job data with tenant context
 */
export interface BaseJobData {
  tenantId: string;
  actorId: string;
  correlationId?: string;
}

/**
 * Job status tracking
 */
export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING';

/**
 * Scrape Report Job
 * Fetches latest CQC inspection report for a facility
 */
export interface ScrapeReportJobData extends BaseJobData {
  facilityId: string;
  cqcLocationId: string;
  providerId: string;
}

export interface ScrapeReportJobResult {
  success: boolean;
  hasReport: boolean;
  skipped?: boolean;
  reason?: string;
  apiReportDate?: string;
  websiteReportDate?: string;
  rating?: string;
  reportDate?: string;
  reportUrl?: string;
  pdfUrl?: string;
  evidenceRecordId?: string;
  summary?: {
    facilityName?: string;
    addressLine1?: string;
    townCity?: string;
    postcode?: string;
    rating?: string;
    reportDate?: string;
    reportUrl?: string;
    pdfUrl?: string;
    source?: 'CQC_WEBSITE' | 'CQC_API';
  };
  error?: string;
}

/**
 * Malware Scan Job
 * Scans uploaded blob for malware using ClamAV
 */
export interface MalwareScanJobData extends BaseJobData {
  blobHash: string;
  mimeType?: string;
}

export interface MalwareScanJobResult {
  blobHash: string;
  status: 'CLEAN' | 'INFECTED' | 'ERROR';
  threat?: string;
  scanEngine: string;
  scannedAt: string;
  quarantined?: boolean;
}

/**
 * Evidence Process Job
 * OCR and text extraction from uploaded evidence
 */
export interface EvidenceProcessJobData extends BaseJobData {
  evidenceRecordId: string;
  blobHash: string;
  mimeType: string;
  fileName: string;
  evidenceType: EvidenceType;
  facilityId: string;
  providerId: string;
}

export interface EvidenceProcessJobResult {
  evidenceRecordId: string;
  extractedText?: string;
  pageCount?: number;
  ocrConfidence?: number;
  metadata?: Record<string, unknown>;
  processingTimeMs: number;
}

/**
 * AI Evidence Analysis Job
 * Uses Gemini to analyze evidence content
 */
export interface AIEvidenceJobData extends BaseJobData {
  evidenceRecordId: string;
  blobHash: string;
  evidenceType: EvidenceType;
  fileName: string;
  extractedText?: string;
  mimeType?: string;
  facilityId: string;
  providerId: string;
}

export interface AIEvidenceJobResult {
  evidenceRecordId: string;
  suggestedType?: EvidenceType;
  suggestedTypeConfidence: number;
  relevantRegulations: string[];
  keyEntities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  summary?: string;
  validationReport: {
    passed: boolean;
    usedFallback: boolean;
    rulesApplied: string[];
    rulesFailed: string[];
  };
}

/**
 * AI Policy Generation Job
 * Uses Gemini to generate policy drafts
 */
export interface AIPolicyJobData extends BaseJobData {
  providerId: string;
  facilityId: string;
  policyType: string;
  regulationIds: string[];
  existingPolicyText?: string;
  context?: {
    serviceType?: string;
    capacity?: number;
    specialConditions?: string[];
  };
}

export interface AIPolicyJobResult {
  draftPolicy: string;
  sections: Array<{
    title: string;
    content: string;
    regulationRef?: string;
  }>;
  confidence: number;
  validationReport: {
    passed: boolean;
    usedFallback: boolean;
    rulesApplied: string[];
    rulesFailed: string[];
  };
}

/**
 * AI Mock Insight Job
 * Uses Gemini to provide advisory insights during mock inspections
 */
export interface AIInsightJobData extends BaseJobData {
  sessionId: string;
  providerId: string;
  facilityId: string;
  topicId: string;
  topicTitle?: string;
  regulationSectionId?: string;
  question: string;
  answer: string;
  previousExchanges?: Array<{
    question: string;
    answer: string;
  }>;
  evidenceContext?: Array<{
    evidenceType: EvidenceType;
    fileName: string;
    summary?: string;
  }>;
  serviceType?: string;
}

export interface AIInsightJobResult {
  sessionId: string;
  insights: Array<{
    type: 'strength' | 'gap' | 'suggestion' | 'follow_up';
    content: string;
    confidence: number;
    regulationRef?: string;
  }>;
  suggestedFollowUp?: string;
  riskIndicators: Array<{
    indicator: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  validationReport: {
    passed: boolean;
    usedFallback: boolean;
    rulesApplied: string[];
    rulesFailed: string[];
  };
}

/**
 * Union type for all job data
 */
export type JobData =
  | ScrapeReportJobData
  | MalwareScanJobData
  | EvidenceProcessJobData
  | AIEvidenceJobData
  | AIPolicyJobData
  | AIInsightJobData;

/**
 * Union type for all job results
 */
export type JobResult =
  | ScrapeReportJobResult
  | MalwareScanJobResult
  | EvidenceProcessJobResult
  | AIEvidenceJobResult
  | AIPolicyJobResult
  | AIInsightJobResult;

/**
 * Job metadata stored with each job
 */
export interface JobMetadata {
  enqueuedAt: string;
  enqueuedBy: string;
  priority?: number;
  attemptsMade: number;
  maxAttempts: number;
}
