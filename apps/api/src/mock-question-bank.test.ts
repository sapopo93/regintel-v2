import { describe, expect, it } from 'vitest';
import { MOCK_QUESTION_BANK, selectQuestion } from './mock-question-bank';
import { TOPICS } from './app';

const topicIds = TOPICS.map((t) => t.id);
const topicMaxFollowUps = new Map(TOPICS.map((t) => [t.id, t.maxFollowUps]));

describe('mock-question-bank', () => {
  it('every TOPICS entry has a MOCK_QUESTION_BANK entry', () => {
    const missing = topicIds.filter((id) => !(id in MOCK_QUESTION_BANK));
    expect(missing, `Missing question bank entries: ${missing.join(', ')}`).toEqual([]);
  });

  it('no orphaned keys in MOCK_QUESTION_BANK', () => {
    const orphaned = Object.keys(MOCK_QUESTION_BANK).filter((id) => !topicIds.includes(id));
    expect(orphaned, `Orphaned question bank keys: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('question count >= maxFollowUps + 1 for each topic', () => {
    const violations: string[] = [];
    for (const topic of TOPICS) {
      const questions = MOCK_QUESTION_BANK[topic.id];
      if (!questions) continue; // covered by the first test
      const needed = topic.maxFollowUps + 1;
      if (questions.length < needed) {
        violations.push(
          `${topic.id}: has ${questions.length} questions but needs >= ${needed} (maxFollowUps=${topic.maxFollowUps})`,
        );
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('no question is empty or whitespace-only', () => {
    const bad: string[] = [];
    for (const [topicId, questions] of Object.entries(MOCK_QUESTION_BANK)) {
      questions.forEach((q, i) => {
        if (!q || !q.trim()) {
          bad.push(`${topicId}[${i}]`);
        }
      });
    }
    expect(bad, `Empty/whitespace questions: ${bad.join(', ')}`).toEqual([]);
  });

  it('selectQuestion returns topic-specific question when bank entry exists', () => {
    const q = selectQuestion('safeguarding', 0);
    expect(q).toContain('safeguarding');
  });

  it('selectQuestion clamps to last question when questionNumber exceeds bank length', () => {
    const questions = MOCK_QUESTION_BANK['safeguarding']!;
    const q = selectQuestion('safeguarding', 999);
    expect(q).toBe(questions[questions.length - 1]);
  });

  it('selectQuestion returns generic fallback for unknown topic', () => {
    const q = selectQuestion('nonexistent-topic', 0);
    expect(q).toContain('Please describe your processes');
  });
});
