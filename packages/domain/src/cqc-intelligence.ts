/**
 * CQC Intelligence Alert Generation (Feature 1: CQC Live Intelligence)
 *
 * Generates RISK_SIGNAL and OUTSTANDING_SIGNAL alerts by cross-referencing
 * CQC inspection reports from other providers with the provider's SAF34 coverage.
 *
 * Pure functions — no side effects, no external calls.
 */

import type { KeyQuestion } from './saf34';
import { SAF_34_QUALITY_STATEMENTS, KEY_QUESTION_LABELS } from './saf34';

// ── Types ────────────────────────────────────────────────────────────

export type IntelligenceType = 'RISK_SIGNAL' | 'OUTSTANDING_SIGNAL';
export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface CqcIntelligenceAlert {
  id: string;
  tenantId: string;
  providerId: string;
  facilityIds: string[];
  intelligenceType: IntelligenceType;
  sourceLocationId: string;
  sourceLocationName: string;
  sourceServiceType: string;
  reportDate: string;
  keyQuestion: KeyQuestion;
  qualityStatementId: string;
  qualityStatementTitle: string;
  findingText: string;
  providerCoveragePercent: number;
  severity: AlertSeverity;
  createdAt: string;
  dismissedAt: string | null;
}

// ── Outstanding Detection Heuristic ─────────────────────────────────

const OUTSTANDING_PHRASES = [
  /outstanding/i,
  /exemplary/i,
  /exceptional/i,
  /innovative/i,
  /best\s*practice/i,
  /above\s*and\s*beyond/i,
  /sector[- ]leading/i,
];

/**
 * Extract the sentence containing a matched phrase from findings text.
 */
function extractMatchingSentence(text: string, pattern: RegExp): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (pattern.test(sentence)) {
      return sentence.trim();
    }
  }
  // Fallback: return first 200 chars
  return text.slice(0, 200).trim();
}

/**
 * Extract first N sentences from text.
 */
function extractFirstSentences(text: string, count: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).slice(0, count);
  return sentences.join(' ').trim() || text.slice(0, 300).trim();
}

// ── Key Question to QS Mapping ──────────────────────────────────────

const KEY_QUESTION_TO_QS_IDS: Record<KeyQuestion, string[]> = {
  SAFE: SAF_34_QUALITY_STATEMENTS.filter((qs) => qs.keyQuestion === 'SAFE').map((qs) => qs.id),
  EFFECTIVE: SAF_34_QUALITY_STATEMENTS.filter((qs) => qs.keyQuestion === 'EFFECTIVE').map((qs) => qs.id),
  CARING: SAF_34_QUALITY_STATEMENTS.filter((qs) => qs.keyQuestion === 'CARING').map((qs) => qs.id),
  RESPONSIVE: SAF_34_QUALITY_STATEMENTS.filter((qs) => qs.keyQuestion === 'RESPONSIVE').map((qs) => qs.id),
  WELL_LED: SAF_34_QUALITY_STATEMENTS.filter((qs) => qs.keyQuestion === 'WELL_LED').map((qs) => qs.id),
};

// ── Severity Calculation ────────────────────────────────────────────

function calculateSeverity(coveragePercent: number, type: IntelligenceType): AlertSeverity {
  if (type === 'RISK_SIGNAL') {
    if (coveragePercent < 30) return 'HIGH';
    if (coveragePercent < 60) return 'MEDIUM';
    return 'LOW';
  }
  // OUTSTANDING_SIGNAL: HIGH = large gap to outstanding coverage, LOW = close to outstanding
  if (coveragePercent < 40) return 'HIGH';
  if (coveragePercent < 70) return 'MEDIUM';
  return 'LOW';
}

// ── Alert Generation ────────────────────────────────────────────────

export interface CqcReportForIntelligence {
  locationId: string;
  locationName: string;
  serviceType: string;
  reportDate: string;
  keyQuestionRatings: Record<string, string>;   // e.g. { safe: "Outstanding", effective: "Good" }
  keyQuestionFindings: Record<string, string>;  // e.g. { safe: "Staff were...", effective: "..." }
}

export interface ProviderCoverageForIntelligence {
  /** Coverage percentage per quality statement ID (e.g. { S1: 0, S7: 35, ... }) */
  perQualityStatement: Record<string, number>;
  /** Coverage percentage per key question */
  perKeyQuestion: Record<KeyQuestion, number>;
}

export interface GenerateAlertsInput {
  tenantId: string;
  providerId: string;
  facilityIds: string[];
  report: CqcReportForIntelligence;
  coverage: ProviderCoverageForIntelligence;
}

// Map rating keys from CQC scraper to KeyQuestion
const RATING_KEY_TO_KQ: Record<string, KeyQuestion> = {
  safe: 'SAFE',
  effective: 'EFFECTIVE',
  caring: 'CARING',
  responsive: 'RESPONSIVE',
  wellLed: 'WELL_LED',
};

/**
 * Generate intelligence alerts from a CQC inspection report.
 *
 * Rules:
 * - "Outstanding" rating → OUTSTANDING_SIGNAL for all QS in that key question
 * - "Requires Improvement" / "Inadequate" → RISK_SIGNAL for all QS in that key question
 * - "Good" → no alerts (expected baseline, not newsworthy)
 * - Findings text containing outstanding phrases → OUTSTANDING_SIGNAL with sentence extraction
 */
export function generateAlerts(input: GenerateAlertsInput): CqcIntelligenceAlert[] {
  const { tenantId, providerId, facilityIds, report, coverage } = input;
  const alerts: CqcIntelligenceAlert[] = [];
  const now = new Date().toISOString();

  for (const [ratingKey, rating] of Object.entries(report.keyQuestionRatings)) {
    const kq = RATING_KEY_TO_KQ[ratingKey];
    if (!kq) continue;

    const normalizedRating = rating.toLowerCase().trim();
    const findingsText = report.keyQuestionFindings[ratingKey] ?? '';
    const qsIds = KEY_QUESTION_TO_QS_IDS[kq];

    if (normalizedRating === 'outstanding') {
      // Generate OUTSTANDING_SIGNAL for all QS in this key question
      for (const qsId of qsIds) {
        const qs = SAF_34_QUALITY_STATEMENTS.find((s) => s.id === qsId);
        if (!qs) continue;

        const qsCoverage = coverage.perQualityStatement[qsId] ?? 0;
        const text = findingsText
          ? extractFirstSentences(findingsText, 2)
          : `CQC rated ${report.locationName} Outstanding for ${KEY_QUESTION_LABELS[kq]}.`;

        alerts.push({
          id: `${tenantId}:alert-${report.locationId}-${qsId}-${report.reportDate}`,
          tenantId,
          providerId,
          facilityIds,
          intelligenceType: 'OUTSTANDING_SIGNAL',
          sourceLocationId: report.locationId,
          sourceLocationName: report.locationName,
          sourceServiceType: report.serviceType,
          reportDate: report.reportDate,
          keyQuestion: kq,
          qualityStatementId: qsId,
          qualityStatementTitle: qs.title,
          findingText: text,
          providerCoveragePercent: qsCoverage,
          severity: calculateSeverity(qsCoverage, 'OUTSTANDING_SIGNAL'),
          createdAt: now,
          dismissedAt: null,
        });
      }
    } else if (normalizedRating === 'requires improvement' || normalizedRating === 'inadequate') {
      // Generate RISK_SIGNAL for all QS in this key question
      for (const qsId of qsIds) {
        const qs = SAF_34_QUALITY_STATEMENTS.find((s) => s.id === qsId);
        if (!qs) continue;

        const qsCoverage = coverage.perQualityStatement[qsId] ?? 0;
        const text = findingsText
          ? extractFirstSentences(findingsText, 2)
          : `CQC rated ${report.locationName} ${rating} for ${KEY_QUESTION_LABELS[kq]}.`;

        alerts.push({
          id: `${tenantId}:alert-${report.locationId}-${qsId}-${report.reportDate}`,
          tenantId,
          providerId,
          facilityIds,
          intelligenceType: 'RISK_SIGNAL',
          sourceLocationId: report.locationId,
          sourceLocationName: report.locationName,
          sourceServiceType: report.serviceType,
          reportDate: report.reportDate,
          keyQuestion: kq,
          qualityStatementId: qsId,
          qualityStatementTitle: qs.title,
          findingText: text,
          providerCoveragePercent: qsCoverage,
          severity: calculateSeverity(qsCoverage, 'RISK_SIGNAL'),
          createdAt: now,
          dismissedAt: null,
        });
      }
    }
    // "Good" → no alerts

    // Text-based outstanding detection (supplement, not replace rating-based)
    if (normalizedRating !== 'outstanding' && findingsText) {
      for (const phrase of OUTSTANDING_PHRASES) {
        if (phrase.test(findingsText)) {
          const matchingSentence = extractMatchingSentence(findingsText, phrase);
          // Generate one alert per key question (not per QS) for text-based detection
          const qsId = qsIds[0]; // Representative QS
          const qs = SAF_34_QUALITY_STATEMENTS.find((s) => s.id === qsId);
          if (!qs) continue;

          const qsCoverage = coverage.perQualityStatement[qsId] ?? 0;
          alerts.push({
            id: `${tenantId}:alert-${report.locationId}-${qsId}-text-${report.reportDate}`,
            tenantId,
            providerId,
            facilityIds,
            intelligenceType: 'OUTSTANDING_SIGNAL',
            sourceLocationId: report.locationId,
            sourceLocationName: report.locationName,
            sourceServiceType: report.serviceType,
            reportDate: report.reportDate,
            keyQuestion: kq,
            qualityStatementId: qsId,
            qualityStatementTitle: qs.title,
            findingText: matchingSentence,
            providerCoveragePercent: qsCoverage,
            severity: calculateSeverity(qsCoverage, 'OUTSTANDING_SIGNAL'),
            createdAt: now,
            dismissedAt: null,
          });
          break; // Only one text-based alert per key question
        }
      }
    }
  }

  return alerts;
}

/**
 * Deduplicate alerts by sourceLocationId + qualityStatementId + reportDate + intelligenceType.
 */
export function deduplicateAlerts(
  newAlerts: CqcIntelligenceAlert[],
  existingAlertKeys: Set<string>
): CqcIntelligenceAlert[] {
  return newAlerts.filter((alert) => {
    const key = alertDeduplicationKey(alert);
    return !existingAlertKeys.has(key);
  });
}

/**
 * Cap alerts at maxCount, prioritised by severity (HIGH first) then lowest coverage first.
 */
export function capAlerts(alerts: CqcIntelligenceAlert[], maxCount: number): CqcIntelligenceAlert[] {
  const severityOrder: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  return [...alerts]
    .sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return a.providerCoveragePercent - b.providerCoveragePercent;
    })
    .slice(0, maxCount);
}

/**
 * Build a deduplication key for an alert.
 */
export function alertDeduplicationKey(alert: CqcIntelligenceAlert): string {
  return `${alert.sourceLocationId}:${alert.qualityStatementId}:${alert.reportDate}:${alert.intelligenceType}`;
}

/**
 * Check if an alert is auto-archived (older than 90 days).
 */
export function isAlertArchived(alert: CqcIntelligenceAlert, now: Date = new Date()): boolean {
  const createdAt = new Date(alert.createdAt);
  const ageMs = now.getTime() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > 90;
}
