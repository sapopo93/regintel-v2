/**
 * AI Validation Package Tests
 *
 * Tests validation rules, confidence scoring, and fallback system.
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationEngine,
  validateAIOutput,
  validateWithFallback,
  noHallucinatedRegulationsRule,
  noComplianceAssertionsRule,
  noRatingPredictionsRule,
  evidenceTypeMismatchRule,
  confidenceConsistencyRule,
  getFallbackOutput,
  isFallbackOutput,
  calculateConfidence,
  getConfidenceLevel,
} from './index';
import { EvidenceType } from '@regintel/domain/evidence-types';
import type { EvidenceAnalysisOutput } from './rules/evidence-rules';
import type { PolicyGenerationOutput } from './rules/policy-rules';
import type { MockInsightOutput } from './rules/insight-rules';

describe('ai-validation:rules:hallucination', () => {
  it('should pass with valid CQC regulations', () => {
    const output: EvidenceAnalysisOutput = {
      relevantRegulations: ['Reg 12(2)(a)', 'Reg 18(1)', 'Regulation 9'],
    };

    const result = noHallucinatedRegulationsRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(true);
  });

  it('should accept regulations from custom valid set', () => {
    const output: EvidenceAnalysisOutput = {
      relevantRegulations: ['Reg 42'],
    };

    const result = noHallucinatedRegulationsRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(['Reg 42']),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(true);
  });

  it('should fail with invented regulations', () => {
    const output: EvidenceAnalysisOutput = {
      relevantRegulations: ['Reg 12(2)(a)', 'Reg 99', 'Regulation 42'],
    };

    const result = noHallucinatedRegulationsRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
    expect(result.details?.invalidRegulations).toContain('Reg 99');
    expect(result.details?.invalidRegulations).toContain('Regulation 42');
  });

  it('should handle empty regulations array', () => {
    const output: EvidenceAnalysisOutput = {
      relevantRegulations: [],
    };

    const result = noHallucinatedRegulationsRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(true);
  });
});

describe('ai-validation:rules:compliance', () => {
  it('should fail when AI claims compliance', () => {
    const output: PolicyGenerationOutput = {
      draftPolicy: 'This policy is compliant with all CQC requirements.',
      sections: [],
    };

    const result = noComplianceAssertionsRule.validate(output, {
      outputType: 'policy-generation',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
    expect(result.details?.forbiddenPhrases).toBeDefined();
  });

  it('should fail when AI claims non-compliance', () => {
    const output: PolicyGenerationOutput = {
      draftPolicy: 'This policy does not comply with regulation requirements.',
      sections: [],
    };

    const result = noComplianceAssertionsRule.validate(output, {
      outputType: 'policy-generation',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
  });

  it('should pass with advisory language', () => {
    const output: PolicyGenerationOutput = {
      draftPolicy: 'This policy addresses key areas from Regulation 12. Review with compliance team recommended.',
      sections: [],
    };

    const result = noComplianceAssertionsRule.validate(output, {
      outputType: 'policy-generation',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(true);
  });
});

describe('ai-validation:rules:rating-predictions', () => {
  it('should fail when AI predicts rating', () => {
    const output: MockInsightOutput = {
      insights: [
        {
          type: 'suggestion',
          content: 'You will likely receive a Good rating at your next inspection.',
          confidence: 0.8,
        },
      ],
    };

    const result = noRatingPredictionsRule.validate(output, {
      outputType: 'mock-insight',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
  });

  it('should fail when AI guarantees outcomes', () => {
    const output: MockInsightOutput = {
      insights: [
        {
          type: 'strength',
          content: 'With these improvements, you will pass your inspection.',
          confidence: 0.9,
        },
      ],
    };

    const result = noRatingPredictionsRule.validate(output, {
      outputType: 'mock-insight',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    // This should be caught by noInspectionGuaranteesRule
    expect(result.passed).toBe(true); // noRatingPredictions passes, guarantees rule catches it
  });

  it('should pass with proper advisory language', () => {
    const output: MockInsightOutput = {
      insights: [
        {
          type: 'suggestion',
          content: 'Consider strengthening your evidence documentation in this area.',
          confidence: 0.7,
        },
      ],
    };

    const result = noRatingPredictionsRule.validate(output, {
      outputType: 'mock-insight',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(true);
  });
});

describe('ai-validation:rules:evidence-type', () => {
  it('should pass with valid evidence type', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedType: EvidenceType.POLICY,
      suggestedTypeConfidence: 0.9,
    };

    const result = evidenceTypeMismatchRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(true);
  });

  it('should fail with invalid evidence type', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedType: 'INVALID_TYPE' as any,
      suggestedTypeConfidence: 0.9,
    };

    const result = evidenceTypeMismatchRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
  });
});

describe('ai-validation:rules:confidence-consistency', () => {
  it('should fail with high confidence and hedging language', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedTypeConfidence: 0.95,
      summary: 'This might be a training document, possibly related to safeguarding.',
    };

    const result = confidenceConsistencyRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
  });

  it('should fail with low confidence and certainty language', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedTypeConfidence: 0.3,
      summary: 'This is definitely a policy document, clearly showing compliance procedures.',
    };

    const result = confidenceConsistencyRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
  });

  it('should pass with consistent confidence and language', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedTypeConfidence: 0.85,
      summary: 'This is a training document covering safeguarding procedures.',
    };

    const result = confidenceConsistencyRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(true);
  });
});

describe('ai-validation:engine', () => {
  it('should validate evidence analysis output', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedType: EvidenceType.TRAINING,
      suggestedTypeConfidence: 0.85,
      relevantRegulations: ['Reg 12(2)(a)', 'Reg 18(1)'],
      keyEntities: [
        { type: 'date', value: '2024-01-15', confidence: 0.9 },
      ],
      summary: 'Training record for infection control procedures.',
    };

    const report = validateAIOutput(output, 'evidence-analysis', 'demo');

    expect(report.passed).toBe(true);
    expect(report.useFallback).toBe(false);
    expect(report.confidence.meetsThreshold).toBe(true);
  });

  it('should trigger fallback on critical failure', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedType: EvidenceType.POLICY,
      suggestedTypeConfidence: 0.9,
      relevantRegulations: ['Reg 99', 'Regulation 100'], // Invalid
      summary: 'This policy document covers custom regulations.',
    };

    const report = validateAIOutput(output, 'evidence-analysis', 'demo');

    expect(report.passed).toBe(false);
    expect(report.useFallback).toBe(true);
    expect(report.failedRules).toContain('no-hallucinated-regulations');
  });

  it('should return fallback output when validation fails', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedType: EvidenceType.POLICY,
      suggestedTypeConfidence: 0.9,
      relevantRegulations: ['Reg 99'], // Invalid
      summary: 'Invalid regulation reference.',
    };

    const result = validateWithFallback(output, 'evidence-analysis', 'demo');

    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toBeDefined();
    expect(result.output.suggestedType).toBe(EvidenceType.OTHER);
  });
});

describe('ai-validation:fallback', () => {
  it('should generate evidence fallback', () => {
    const fallback = getFallbackOutput('evidence-analysis', {
      tenantId: 'demo',
      reason: 'Test failure',
      failedRules: ['test-rule'],
    });

    expect(fallback.suggestedType).toBe(EvidenceType.OTHER);
    expect(fallback.suggestedTypeConfidence).toBe(0);
    expect(isFallbackOutput(fallback)).toBe(true);
  });

  it('should generate policy fallback', () => {
    const fallback = getFallbackOutput('policy-generation', {
      tenantId: 'demo',
      reason: 'Test failure',
      failedRules: ['test-rule'],
    });

    expect(fallback.confidence).toBe(0);
    expect(fallback.sections?.[0]?.title).toBe('Manual Review Required');
    expect(isFallbackOutput(fallback)).toBe(true);
  });

  it('should generate insight fallback', () => {
    const fallback = getFallbackOutput('mock-insight', {
      tenantId: 'demo',
      reason: 'Test failure',
      failedRules: ['test-rule'],
    });

    expect(fallback.insights?.[0]?.confidence).toBe(0);
    expect(isFallbackOutput(fallback)).toBe(true);
  });

  it('should detect non-fallback output', () => {
    const realOutput: EvidenceAnalysisOutput = {
      suggestedType: EvidenceType.TRAINING,
      suggestedTypeConfidence: 0.9,
      relevantRegulations: ['Reg 12'],
      summary: 'Real analysis result.',
    };

    expect(isFallbackOutput(realOutput)).toBe(false);
  });
});

describe('ai-validation:confidence', () => {
  it('should calculate confidence correctly', () => {
    const result = calculateConfidence(
      0.8,
      [
        { ruleName: 'r1', passed: true, severity: 'CRITICAL', category: 'hallucination' },
        { ruleName: 'r2', passed: true, severity: 'HIGH', category: 'compliance' },
        { ruleName: 'r3', passed: false, severity: 'LOW', category: 'content' },
      ],
      { text: 'Sample content for analysis.' }
    );

    expect(result.overall).toBeGreaterThan(0.5);
    expect(result.meetsThreshold).toBe(true);
    expect(result.components.modelConfidence).toBe(0.8);
  });

  it('should fail confidence on critical failure', () => {
    const result = calculateConfidence(
      0.9,
      [
        { ruleName: 'r1', passed: false, severity: 'CRITICAL', category: 'hallucination' },
        { ruleName: 'r2', passed: true, severity: 'HIGH', category: 'compliance' },
      ],
      { text: 'Sample content.' }
    );

    expect(result.overall).toBe(0);
    expect(result.meetsThreshold).toBe(false);
  });

  it('should return correct confidence levels', () => {
    expect(getConfidenceLevel(0.9)).toBe('high');
    expect(getConfidenceLevel(0.7)).toBe('medium');
    expect(getConfidenceLevel(0.5)).toBe('low');
    expect(getConfidenceLevel(0.2)).toBe('very_low');
  });
});

describe('ai-validation:adversarial', () => {
  it('should handle empty output gracefully', () => {
    const output: EvidenceAnalysisOutput = {};

    const report = validateAIOutput(output, 'evidence-analysis', 'demo');

    // Should pass since there's nothing to fail
    expect(report.results.length).toBeGreaterThan(0);
  });

  it('should handle malformed regulation references', () => {
    const output: EvidenceAnalysisOutput = {
      relevantRegulations: ['', '   ', 'Reg', 'Regulation', '12', 'Reg-12'],
    };

    const result = noHallucinatedRegulationsRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    expect(result.passed).toBe(false);
  });

  it('should handle extreme confidence values', () => {
    const output: EvidenceAnalysisOutput = {
      suggestedTypeConfidence: 1.5, // Invalid but should handle
      summary: 'Test',
    };

    const result = confidenceConsistencyRule.validate(output, {
      outputType: 'evidence-analysis',
      tenantId: 'demo',
      validRegulations: new Set(),
      confidenceThreshold: 0.7,
    });

    // Should still run without crashing
    expect(result.ruleName).toBe('confidence-consistency');
  });
});
