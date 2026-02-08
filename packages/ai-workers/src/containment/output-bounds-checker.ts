/**
 * Output Bounds Checker
 *
 * Validates AI outputs stay within expected bounds.
 * Catches malformed outputs before they reach the validation engine.
 */

import { EvidenceType, isValidEvidenceType } from '@regintel/domain/evidence-types';

/**
 * Bounds check result
 */
export interface BoundsCheckResult {
  /** Whether output is within bounds */
  valid: boolean;

  /** Errors found */
  errors: string[];

  /** Warnings (non-fatal) */
  warnings: string[];

  /** Suggested fixes applied */
  fixes: string[];

  /** Fixed output if applicable */
  fixedOutput?: unknown;
}

/**
 * Numeric bounds configuration
 */
interface NumericBounds {
  min?: number;
  max?: number;
  integer?: boolean;
}

/**
 * String bounds configuration
 */
interface StringBounds {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

/**
 * Array bounds configuration
 */
interface ArrayBounds {
  minItems?: number;
  maxItems?: number;
}

/**
 * Check numeric value bounds
 */
export function checkNumericBounds(
  value: unknown,
  field: string,
  bounds: NumericBounds
): { valid: boolean; errors: string[]; fixed?: number } {
  const errors: string[] = [];
  let fixed: number | undefined;

  if (typeof value !== 'number') {
    // Try to parse
    const parsed = Number(value);
    if (isNaN(parsed)) {
      errors.push(`${field}: Expected number, got ${typeof value}`);
      return { valid: false, errors };
    }
    fixed = parsed;
  }

  const num = fixed ?? (value as number);

  if (bounds.integer && !Number.isInteger(num)) {
    errors.push(`${field}: Expected integer, got ${num}`);
    fixed = Math.round(num);
  }

  if (bounds.min !== undefined && num < bounds.min) {
    errors.push(`${field}: Value ${num} below minimum ${bounds.min}`);
    fixed = bounds.min;
  }

  if (bounds.max !== undefined && num > bounds.max) {
    errors.push(`${field}: Value ${num} above maximum ${bounds.max}`);
    fixed = bounds.max;
  }

  return { valid: errors.length === 0, errors, fixed };
}

/**
 * Check string value bounds
 */
export function checkStringBounds(
  value: unknown,
  field: string,
  bounds: StringBounds
): { valid: boolean; errors: string[]; fixed?: string } {
  const errors: string[] = [];
  let fixed: string | undefined;

  if (typeof value !== 'string') {
    if (value === null || value === undefined) {
      fixed = '';
    } else {
      fixed = String(value);
    }
  }

  const str = fixed ?? (value as string);

  if (bounds.minLength !== undefined && str.length < bounds.minLength) {
    errors.push(`${field}: String length ${str.length} below minimum ${bounds.minLength}`);
  }

  if (bounds.maxLength !== undefined && str.length > bounds.maxLength) {
    errors.push(`${field}: String length ${str.length} above maximum ${bounds.maxLength}`);
    fixed = str.slice(0, bounds.maxLength);
  }

  if (bounds.pattern && !bounds.pattern.test(str)) {
    errors.push(`${field}: String does not match required pattern`);
  }

  return { valid: errors.length === 0, errors, fixed };
}

/**
 * Check array bounds
 */
export function checkArrayBounds(
  value: unknown,
  field: string,
  bounds: ArrayBounds
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    errors.push(`${field}: Expected array, got ${typeof value}`);
    return { valid: false, errors };
  }

  if (bounds.minItems !== undefined && value.length < bounds.minItems) {
    errors.push(`${field}: Array has ${value.length} items, minimum is ${bounds.minItems}`);
  }

  if (bounds.maxItems !== undefined && value.length > bounds.maxItems) {
    errors.push(`${field}: Array has ${value.length} items, maximum is ${bounds.maxItems}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check evidence analysis output bounds
 */
export function checkEvidenceAnalysisBounds(output: unknown): BoundsCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixes: string[] = [];
  let fixedOutput = output && typeof output === 'object' ? { ...output } as Record<string, unknown> : undefined;

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be an object'], warnings, fixes };
  }

  const obj = output as Record<string, unknown>;

  // Check confidence bounds
  if ('suggestedTypeConfidence' in obj) {
    const check = checkNumericBounds(obj.suggestedTypeConfidence, 'suggestedTypeConfidence', { min: 0, max: 1 });
    errors.push(...check.errors);
    if (check.fixed !== undefined && fixedOutput) {
      fixedOutput.suggestedTypeConfidence = check.fixed;
      fixes.push(`Fixed suggestedTypeConfidence to ${check.fixed}`);
    }
  }

  // Check evidence type
  if ('suggestedType' in obj && obj.suggestedType) {
    if (!isValidEvidenceType(obj.suggestedType)) {
      warnings.push(`Invalid suggestedType: ${obj.suggestedType}, will be replaced with OTHER`);
      if (fixedOutput) {
        fixedOutput.suggestedType = EvidenceType.OTHER;
        fixes.push('Changed invalid suggestedType to OTHER');
      }
    }
  }

  // Check regulations array
  if ('relevantRegulations' in obj && obj.relevantRegulations) {
    const check = checkArrayBounds(obj.relevantRegulations, 'relevantRegulations', { maxItems: 20 });
    errors.push(...check.errors);
    if (!check.valid && fixedOutput && Array.isArray(obj.relevantRegulations)) {
      fixedOutput.relevantRegulations = obj.relevantRegulations.slice(0, 20);
      fixes.push('Truncated relevantRegulations to 20 items');
    }
  }

  // Check summary length
  if ('summary' in obj && obj.summary) {
    const check = checkStringBounds(obj.summary, 'summary', { maxLength: 5000 });
    if (check.errors.length > 0) {
      warnings.push(...check.errors);
      if (check.fixed !== undefined && fixedOutput) {
        fixedOutput.summary = check.fixed;
        fixes.push('Truncated summary to 5000 characters');
      }
    }
  }

  // Check entities array and confidence
  if ('keyEntities' in obj && Array.isArray(obj.keyEntities)) {
    const arrayCheck = checkArrayBounds(obj.keyEntities, 'keyEntities', { maxItems: 50 });
    if (!arrayCheck.valid) {
      warnings.push(...arrayCheck.errors);
    }

    for (let i = 0; i < obj.keyEntities.length && i < 50; i++) {
      const entity = obj.keyEntities[i] as Record<string, unknown>;
      if (entity && 'confidence' in entity) {
        const confCheck = checkNumericBounds(entity.confidence, `keyEntities[${i}].confidence`, { min: 0, max: 1 });
        if (!confCheck.valid) {
          warnings.push(...confCheck.errors);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixes,
    fixedOutput: fixes.length > 0 ? fixedOutput : undefined,
  };
}

/**
 * Check policy generation output bounds
 */
export function checkPolicyGenerationBounds(output: unknown): BoundsCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixes: string[] = [];
  let fixedOutput = output && typeof output === 'object' ? { ...output } as Record<string, unknown> : undefined;

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be an object'], warnings, fixes };
  }

  const obj = output as Record<string, unknown>;

  // Check confidence bounds
  if ('confidence' in obj) {
    const check = checkNumericBounds(obj.confidence, 'confidence', { min: 0, max: 1 });
    errors.push(...check.errors);
    if (check.fixed !== undefined && fixedOutput) {
      fixedOutput.confidence = check.fixed;
      fixes.push(`Fixed confidence to ${check.fixed}`);
    }
  }

  // Check draft policy length
  if ('draftPolicy' in obj && obj.draftPolicy) {
    const check = checkStringBounds(obj.draftPolicy, 'draftPolicy', { maxLength: 50000 });
    if (check.errors.length > 0) {
      warnings.push(...check.errors);
      if (check.fixed !== undefined && fixedOutput) {
        fixedOutput.draftPolicy = check.fixed;
        fixes.push('Truncated draftPolicy');
      }
    }
  }

  // Check sections array
  if ('sections' in obj && Array.isArray(obj.sections)) {
    const arrayCheck = checkArrayBounds(obj.sections, 'sections', { maxItems: 30 });
    if (!arrayCheck.valid) {
      warnings.push(...arrayCheck.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixes,
    fixedOutput: fixes.length > 0 ? fixedOutput : undefined,
  };
}

/**
 * Check mock insight output bounds
 */
export function checkInsightBounds(output: unknown): BoundsCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixes: string[] = [];
  let fixedOutput = output && typeof output === 'object' ? { ...output } as Record<string, unknown> : undefined;

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be an object'], warnings, fixes };
  }

  const obj = output as Record<string, unknown>;

  // Check insights array
  if ('insights' in obj && Array.isArray(obj.insights)) {
    const arrayCheck = checkArrayBounds(obj.insights, 'insights', { maxItems: 20 });
    if (!arrayCheck.valid) {
      warnings.push(...arrayCheck.errors);
    }

    // Check individual insight confidences
    for (let i = 0; i < obj.insights.length && i < 20; i++) {
      const insight = obj.insights[i] as Record<string, unknown>;
      if (insight && 'confidence' in insight) {
        const confCheck = checkNumericBounds(insight.confidence, `insights[${i}].confidence`, { min: 0, max: 1 });
        if (!confCheck.valid) {
          warnings.push(...confCheck.errors);
        }
      }
    }
  }

  // Check risk indicators array
  if ('riskIndicators' in obj && Array.isArray(obj.riskIndicators)) {
    const arrayCheck = checkArrayBounds(obj.riskIndicators, 'riskIndicators', { maxItems: 15 });
    if (!arrayCheck.valid) {
      warnings.push(...arrayCheck.errors);
    }

    // Check valid severities
    const validSeverities = new Set(['LOW', 'MEDIUM', 'HIGH']);
    for (let i = 0; i < obj.riskIndicators.length && i < 15; i++) {
      const indicator = obj.riskIndicators[i] as Record<string, unknown>;
      if (indicator && 'severity' in indicator) {
        if (!validSeverities.has(indicator.severity as string)) {
          errors.push(`riskIndicators[${i}].severity: Invalid value "${indicator.severity}"`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixes,
    fixedOutput: fixes.length > 0 ? fixedOutput : undefined,
  };
}
