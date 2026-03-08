/**
 * SAF 34 Quality Statement Coverage (Phase 11)
 *
 * Maps CQC's 34 Quality Statements grouped under 5 Key Questions
 * to topic catalog entries via regulation_keys. Enables gap analysis
 * for inspection readiness.
 *
 * Reference: CQC Single Assessment Framework (SAF)
 * https://www.cqc.org.uk/guidance-providers/assessment/single-assessment-framework
 */

/**
 * CQC Key Questions
 */
export type KeyQuestion = 'SAFE' | 'EFFECTIVE' | 'CARING' | 'RESPONSIVE' | 'WELL_LED';

export const KEY_QUESTION_LABELS: Record<KeyQuestion, string> = {
  SAFE: 'Safe',
  EFFECTIVE: 'Effective',
  CARING: 'Caring',
  RESPONSIVE: 'Responsive',
  WELL_LED: 'Well-Led',
};

/**
 * Quality Statement definition
 */
export interface QualityStatement {
  id: string;           // e.g. "S1", "C3"
  keyQuestion: KeyQuestion;
  title: string;
  description: string;
  regulationKeys: string[];  // Maps to topic regulation_keys for matching
}

/**
 * All 34 CQC Quality Statements
 */
export const SAF_34_QUALITY_STATEMENTS: QualityStatement[] = [
  // ── Safe (S1–S9) ─────────────────────────────────────────────
  {
    id: 'S1',
    keyQuestion: 'SAFE',
    title: 'Learning culture',
    description: 'Staff learn from safety events, near misses, and concerns to improve safety.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE'],
  },
  {
    id: 'S2',
    keyQuestion: 'SAFE',
    title: 'Safe systems, pathways and transitions',
    description: 'People move safely between services with coordinated care.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE'],
  },
  {
    id: 'S3',
    keyQuestion: 'SAFE',
    title: 'Safeguarding',
    description: 'People are protected from abuse, neglect and exploitation.',
    regulationKeys: ['CQC:REG:SAFEGUARDING', 'CQC:QS:SAFE'],
  },
  {
    id: 'S4',
    keyQuestion: 'SAFE',
    title: 'Involving people to manage risks',
    description: 'People are involved in managing risks to maximise independence.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE'],
  },
  {
    id: 'S5',
    keyQuestion: 'SAFE',
    title: 'Safe environments',
    description: 'The environment is safe, well-maintained, and suitable.',
    regulationKeys: ['CQC:REG:PREMISES', 'CQC:QS:SAFE'],
  },
  {
    id: 'S6',
    keyQuestion: 'SAFE',
    title: 'Safe and effective staffing',
    description: 'Enough qualified, skilled and experienced staff to provide safe care.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:SAFE'],
  },
  {
    id: 'S7',
    keyQuestion: 'SAFE',
    title: 'Infection prevention and control',
    description: 'People are protected from healthcare-associated infections.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE', 'CQC:REG:IPC'],
  },
  {
    id: 'S8',
    keyQuestion: 'SAFE',
    title: 'Medicines optimisation',
    description: 'Medicines are managed safely and effectively.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE', 'CQC:REG:MEDICINES'],
  },
  {
    id: 'S9',
    keyQuestion: 'SAFE',
    title: 'Recognising and responding to short-term risks',
    description: 'Staff recognise and respond to people whose condition deteriorates.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE'],
  },

  // ── Effective (E1–E9) ─────────────────────────────────────────
  {
    id: 'E1',
    keyQuestion: 'EFFECTIVE',
    title: 'Assessing needs',
    description: 'People\'s care needs are assessed, reviewed, and met.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E2',
    keyQuestion: 'EFFECTIVE',
    title: 'Delivering evidence-based care and treatment',
    description: 'Care is evidence-based and in line with best practice.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E3',
    keyQuestion: 'EFFECTIVE',
    title: 'How staff, teams and services work together',
    description: 'Staff and services work together effectively.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E4',
    keyQuestion: 'EFFECTIVE',
    title: 'Supporting people to live healthier lives',
    description: 'People are supported to live healthier lives and manage conditions.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E5',
    keyQuestion: 'EFFECTIVE',
    title: 'Monitoring and improving outcomes',
    description: 'Outcomes are monitored and used to improve care.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E6',
    keyQuestion: 'EFFECTIVE',
    title: 'Consent to care and treatment',
    description: 'People\'s consent is sought in line with legislation.',
    regulationKeys: ['CQC:REG:CONSENT', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E7',
    keyQuestion: 'EFFECTIVE',
    title: 'Mental Capacity Act and Deprivation of Liberty',
    description: 'The MCA and DoLS are applied correctly.',
    regulationKeys: ['CQC:REG:CONSENT', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E8',
    keyQuestion: 'EFFECTIVE',
    title: 'Workforce wellbeing and enablement',
    description: 'Staff are supported with training, wellbeing and development.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E9',
    keyQuestion: 'EFFECTIVE',
    title: 'Equity in access',
    description: 'People can access care equitably regardless of background.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:EFFECTIVE'],
  },

  // ── Caring (C1–C4) ───────────────────────────────────────────
  {
    id: 'C1',
    keyQuestion: 'CARING',
    title: 'Kindness, compassion and dignity',
    description: 'People are treated with kindness, compassion, and their dignity is upheld.',
    regulationKeys: ['CQC:REG:DIGNITY', 'CQC:QS:CARING'],
  },
  {
    id: 'C2',
    keyQuestion: 'CARING',
    title: 'Treating people as individuals',
    description: 'People are treated as individuals with their own needs, preferences and choices.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:CARING'],
  },
  {
    id: 'C3',
    keyQuestion: 'CARING',
    title: 'Independence, choice and control',
    description: 'People are empowered and supported to maintain independence and control.',
    regulationKeys: ['CQC:REG:DIGNITY', 'CQC:QS:CARING'],
  },
  {
    id: 'C4',
    keyQuestion: 'CARING',
    title: 'Responding to people\'s immediate needs',
    description: 'People\'s immediate physical, emotional and social needs are met.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:CARING'],
  },

  // ── Responsive (R1–R4) ───────────────────────────────────────
  {
    id: 'R1',
    keyQuestion: 'RESPONSIVE',
    title: 'Person-centred care',
    description: 'Care is personalised and responsive to individual needs.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R2',
    keyQuestion: 'RESPONSIVE',
    title: 'Care provision, integration and continuity',
    description: 'Care is coordinated and people experience continuity.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R3',
    keyQuestion: 'RESPONSIVE',
    title: 'Providing information',
    description: 'People receive clear, timely information about their care.',
    regulationKeys: ['CQC:REG:DUTY_OF_CANDOUR', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R4',
    keyQuestion: 'RESPONSIVE',
    title: 'Listening to and involving people',
    description: 'People\'s views and experiences are listened to and acted on.',
    regulationKeys: ['CQC:REG:COMPLAINTS', 'CQC:QS:RESPONSIVE'],
  },

  // ── Well-Led (W1–W8) ─────────────────────────────────────────
  {
    id: 'W1',
    keyQuestion: 'WELL_LED',
    title: 'Shared direction and culture',
    description: 'Leaders have a clear vision and promote an open, person-centred culture.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W2',
    keyQuestion: 'WELL_LED',
    title: 'Capable, compassionate and inclusive leaders',
    description: 'Leaders are capable, compassionate and promote equality.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W3',
    keyQuestion: 'WELL_LED',
    title: 'Freedom to speak up',
    description: 'People and staff can speak up without fear.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W4',
    keyQuestion: 'WELL_LED',
    title: 'Governance, management and sustainability',
    description: 'Robust governance ensures accountability, continuous improvement and sustainability.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W5',
    keyQuestion: 'WELL_LED',
    title: 'Partnerships and communities',
    description: 'The service works with partners and communities to improve care.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W6',
    keyQuestion: 'WELL_LED',
    title: 'Learning, improvement and innovation',
    description: 'There is a culture of learning, improvement and innovation.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W7',
    keyQuestion: 'WELL_LED',
    title: 'Environmental sustainability',
    description: 'The service considers environmental sustainability.',
    regulationKeys: ['CQC:REG:PREMISES', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W8',
    keyQuestion: 'WELL_LED',
    title: 'Workforce equality, diversity and inclusion',
    description: 'Staff are treated equitably and diversity is promoted.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:WELL_LED'],
  },
];

/**
 * Minimal topic shape needed for coverage analysis
 */
export interface TopicForCoverage {
  id: string;
  title: string;
  regulationSectionId?: string;
  regulationKeys?: string[];
}

/**
 * Coverage result for a single Quality Statement
 */
export interface QualityStatementCoverage {
  qualityStatement: QualityStatement;
  covered: boolean;
  matchingTopicIds: string[];
}

/**
 * Summary for a Key Question
 */
export interface KeyQuestionSummary {
  keyQuestion: KeyQuestion;
  label: string;
  total: number;
  covered: number;
  percentage: number;
}

/**
 * Full SAF 34 coverage result
 */
export interface Saf34CoverageResult {
  statements: QualityStatementCoverage[];
  keyQuestions: KeyQuestionSummary[];
  overall: {
    total: number;
    covered: number;
    percentage: number;
  };
}

/**
 * Compute which of the 34 Quality Statements are covered by the given topics.
 *
 * A QS is "covered" if at least one topic shares a regulation_key with it.
 * Topics use regulation_keys like "CQC:REG:SAFEGUARDING" or "CQC:QS:SAFE".
 * The TOPICS array in app.ts uses regulationSectionId like "Reg 12(2)(a)".
 * We also match on partial regulation key overlap.
 */
export function getQualityStatementCoverage(
  topics: TopicForCoverage[]
): Saf34CoverageResult {
  // Build a set of all regulation keys from topics
  const topicRegKeys = new Set<string>();
  const topicRegSections = new Set<string>();

  for (const topic of topics) {
    if (topic.regulationKeys) {
      for (const key of topic.regulationKeys) {
        topicRegKeys.add(key);
      }
    }
    if (topic.regulationSectionId) {
      topicRegSections.add(topic.regulationSectionId);
    }
  }

  const statements: QualityStatementCoverage[] = SAF_34_QUALITY_STATEMENTS.map((qs) => {
    const matchingTopicIds: string[] = [];

    for (const topic of topics) {
      const topicKeys = new Set<string>();
      if (topic.regulationKeys) {
        for (const k of topic.regulationKeys) topicKeys.add(k);
      }

      // Check if any of the QS regulation keys match topic keys
      const hasMatch = qs.regulationKeys.some((qsKey) => topicKeys.has(qsKey));
      if (hasMatch) {
        matchingTopicIds.push(topic.id);
      }
    }

    return {
      qualityStatement: qs,
      covered: matchingTopicIds.length > 0,
      matchingTopicIds,
    };
  });

  const keyQuestions = getKeyQuestionSummary(statements);

  const covered = statements.filter((s) => s.covered).length;
  return {
    statements,
    keyQuestions,
    overall: {
      total: SAF_34_QUALITY_STATEMENTS.length,
      covered,
      percentage: Math.round((covered / SAF_34_QUALITY_STATEMENTS.length) * 100),
    },
  };
}

/**
 * Aggregate coverage by Key Question
 */
export function getKeyQuestionSummary(
  statements: QualityStatementCoverage[]
): KeyQuestionSummary[] {
  const groups = new Map<KeyQuestion, { total: number; covered: number }>();

  for (const s of statements) {
    const kq = s.qualityStatement.keyQuestion;
    const existing = groups.get(kq) || { total: 0, covered: 0 };
    existing.total++;
    if (s.covered) existing.covered++;
    groups.set(kq, existing);
  }

  const order: KeyQuestion[] = ['SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL_LED'];

  return order.map((kq) => {
    const data = groups.get(kq) || { total: 0, covered: 0 };
    return {
      keyQuestion: kq,
      label: KEY_QUESTION_LABELS[kq],
      total: data.total,
      covered: data.covered,
      percentage: data.total > 0 ? Math.round((data.covered / data.total) * 100) : 0,
    };
  });
}
