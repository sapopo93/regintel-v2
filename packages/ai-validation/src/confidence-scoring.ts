/**
 * Confidence Scoring
 *
 * Computes confidence scores for AI outputs based on
 * multiple signals (model confidence, validation results, content quality).
 */

import type { RuleResult } from './rules/base-rule';

/**
 * Confidence score result
 */
export interface ConfidenceScore {
  /** Overall confidence (0-1) */
  overall: number;

  /** Component scores */
  components: {
    /** Model's self-reported confidence */
    modelConfidence: number;
    /** Validation rule pass rate */
    validationScore: number;
    /** Content quality indicators */
    contentQuality: number;
  };

  /** Whether confidence meets threshold */
  meetsThreshold: boolean;

  /** Threshold used */
  threshold: number;
}

/**
 * Configuration for confidence calculation
 */
export interface ConfidenceConfig {
  /** Minimum threshold for confidence (default: 0.7) */
  threshold: number;

  /** Weights for combining scores */
  weights: {
    modelConfidence: number;
    validationScore: number;
    contentQuality: number;
  };
}

const DEFAULT_CONFIG: ConfidenceConfig = {
  threshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.7'),
  weights: {
    modelConfidence: 0.4,
    validationScore: 0.4,
    contentQuality: 0.2,
  },
};

/**
 * Calculate validation score from rule results
 */
function calculateValidationScore(results: RuleResult[]): number {
  if (results.length === 0) return 1;

  // Weight by severity
  const weights = { CRITICAL: 4, HIGH: 2, MEDIUM: 1, LOW: 0.5 };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of results) {
    const weight = weights[result.severity];
    weightedSum += result.passed ? weight : 0;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 1;
}

/**
 * Analyze content quality
 */
function analyzeContentQuality(content: {
  text?: string;
  entities?: Array<{ confidence?: number }>;
  sections?: Array<{ content?: string }>;
}): number {
  let qualityFactors: number[] = [];

  // Text length factor (longer is generally better, up to a point)
  if (content.text) {
    const textLength = content.text.length;
    const lengthScore = Math.min(1, textLength / 500); // Cap at 500 chars
    qualityFactors.push(lengthScore);
  }

  // Entity confidence factor
  if (content.entities && content.entities.length > 0) {
    const avgConfidence =
      content.entities.reduce((sum, e) => sum + (e.confidence || 0.5), 0) /
      content.entities.length;
    qualityFactors.push(avgConfidence);
  }

  // Section coverage factor
  if (content.sections && content.sections.length > 0) {
    const filledSections = content.sections.filter(
      (s) => s.content && s.content.length > 20
    );
    const coverageScore = filledSections.length / content.sections.length;
    qualityFactors.push(coverageScore);
  }

  // Average all factors
  if (qualityFactors.length === 0) return 0.5;
  return qualityFactors.reduce((a, b) => a + b, 0) / qualityFactors.length;
}

/**
 * Calculate overall confidence score
 */
export function calculateConfidence(
  modelConfidence: number,
  validationResults: RuleResult[],
  content: {
    text?: string;
    entities?: Array<{ confidence?: number }>;
    sections?: Array<{ content?: string }>;
  },
  config: Partial<ConfidenceConfig> = {}
): ConfidenceScore {
  const cfg: ConfidenceConfig = { ...DEFAULT_CONFIG, ...config };

  // Calculate component scores
  const validationScore = calculateValidationScore(validationResults);
  const contentQuality = analyzeContentQuality(content);

  // Weighted average
  const { weights } = cfg;
  const overall =
    modelConfidence * weights.modelConfidence +
    validationScore * weights.validationScore +
    contentQuality * weights.contentQuality;

  // Critical failures always fail
  const hasCriticalFailure = validationResults.some(
    (r) => !r.passed && r.severity === 'CRITICAL'
  );

  return {
    overall: hasCriticalFailure ? 0 : overall,
    components: {
      modelConfidence,
      validationScore,
      contentQuality,
    },
    meetsThreshold: !hasCriticalFailure && overall >= cfg.threshold,
    threshold: cfg.threshold,
  };
}

/**
 * Quick check if confidence meets threshold
 */
export function meetsConfidenceThreshold(
  modelConfidence: number,
  validationResults: RuleResult[],
  threshold?: number
): boolean {
  const result = calculateConfidence(modelConfidence, validationResults, {}, {
    threshold: threshold || DEFAULT_CONFIG.threshold,
  });
  return result.meetsThreshold;
}

/**
 * Get human-readable confidence level
 */
export function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'very_low' {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  if (score >= 0.4) return 'low';
  return 'very_low';
}
