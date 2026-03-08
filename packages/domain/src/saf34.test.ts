import { describe, it, expect } from 'vitest';
import {
  SAF_34_QUALITY_STATEMENTS,
  getQualityStatementCoverage,
  getKeyQuestionSummary,
  KEY_QUESTION_LABELS,
  type TopicForCoverage,
} from './saf34';

describe('saf34', () => {
  it('defines exactly 34 quality statements', () => {
    expect(SAF_34_QUALITY_STATEMENTS).toHaveLength(34);
  });

  it('covers all 5 key questions', () => {
    const keyQuestions = new Set(SAF_34_QUALITY_STATEMENTS.map((qs) => qs.keyQuestion));
    expect(keyQuestions).toEqual(new Set(['SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL_LED']));
  });

  it('has correct counts per key question', () => {
    const counts: Record<string, number> = {};
    for (const qs of SAF_34_QUALITY_STATEMENTS) {
      counts[qs.keyQuestion] = (counts[qs.keyQuestion] || 0) + 1;
    }
    expect(counts.SAFE).toBe(9);
    expect(counts.EFFECTIVE).toBe(9);
    expect(counts.CARING).toBe(4);
    expect(counts.RESPONSIVE).toBe(4);
    expect(counts.WELL_LED).toBe(8);
  });

  it('all statements have unique IDs', () => {
    const ids = SAF_34_QUALITY_STATEMENTS.map((qs) => qs.id);
    expect(new Set(ids).size).toBe(34);
  });

  it('all statements have at least one regulation key', () => {
    for (const qs of SAF_34_QUALITY_STATEMENTS) {
      expect(qs.regulationKeys.length, `${qs.id} has no regulation keys`).toBeGreaterThan(0);
    }
  });

  describe('getQualityStatementCoverage', () => {
    it('returns 0% coverage with no topics', () => {
      const result = getQualityStatementCoverage([]);
      expect(result.overall.total).toBe(34);
      expect(result.overall.covered).toBe(0);
      expect(result.overall.percentage).toBe(0);
    });

    it('matches topics by regulation keys', () => {
      const topics: TopicForCoverage[] = [
        { id: 'safeguarding', title: 'Safeguarding', regulationKeys: ['CQC:REG:SAFEGUARDING', 'CQC:QS:SAFE'] },
      ];
      const result = getQualityStatementCoverage(topics);

      // S3 (Safeguarding) should be covered
      const s3 = result.statements.find((s) => s.qualityStatement.id === 'S3');
      expect(s3?.covered).toBe(true);
      expect(s3?.matchingTopicIds).toContain('safeguarding');

      expect(result.overall.covered).toBeGreaterThan(0);
    });

    it('computes key question summaries', () => {
      const topics: TopicForCoverage[] = [
        { id: 'dignity', title: 'Dignity', regulationKeys: ['CQC:REG:DIGNITY', 'CQC:QS:CARING'] },
      ];
      const result = getQualityStatementCoverage(topics);

      const caring = result.keyQuestions.find((kq) => kq.keyQuestion === 'CARING');
      expect(caring).toBeDefined();
      expect(caring!.covered).toBeGreaterThan(0);
      expect(caring!.total).toBe(4);
    });

    it('returns full coverage when all keys are matched', () => {
      // Create topics covering all regulation keys from all QS
      const allRegKeys = new Set<string>();
      for (const qs of SAF_34_QUALITY_STATEMENTS) {
        for (const key of qs.regulationKeys) {
          allRegKeys.add(key);
        }
      }
      const topics: TopicForCoverage[] = [
        { id: 'all', title: 'All', regulationKeys: [...allRegKeys] },
      ];
      const result = getQualityStatementCoverage(topics);
      expect(result.overall.covered).toBe(34);
      expect(result.overall.percentage).toBe(100);
    });
  });

  describe('getKeyQuestionSummary', () => {
    it('returns all 5 key questions in order', () => {
      const result = getQualityStatementCoverage([]);
      expect(result.keyQuestions).toHaveLength(5);
      expect(result.keyQuestions.map((kq) => kq.keyQuestion)).toEqual([
        'SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL_LED',
      ]);
    });

    it('includes human-readable labels', () => {
      const result = getQualityStatementCoverage([]);
      for (const kq of result.keyQuestions) {
        expect(kq.label).toBe(KEY_QUESTION_LABELS[kq.keyQuestion as keyof typeof KEY_QUESTION_LABELS]);
      }
    });
  });
});
