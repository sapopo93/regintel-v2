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
  topicId: string;      // Direct 1:1 binding to topic catalog entry
  regulationKeys: string[];  // Maps to topic regulation_keys for matching
}

/**
 * All 34 CQC Quality Statements (8-6-5-7-8)
 */
export const SAF_34_QUALITY_STATEMENTS: QualityStatement[] = [
  // ── Safe (S1–S8) ─────────────────────────────────────────────
  {
    id: 'S1',
    keyQuestion: 'SAFE',
    title: 'Learning Culture',
    topicId: 'learning-culture',
    description: 'We have a proactive and positive culture of safety based on openness and honesty, in which concerns about safety are listened to, safety events are investigated and reported thoroughly, and lessons are learned to continually identify and embed good practice.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE'],
  },
  {
    id: 'S2',
    keyQuestion: 'SAFE',
    title: 'Safe Systems, Pathways and Transitions',
    topicId: 'safe-systems-pathways-transitions',
    description: 'We work with people and partners to establish and maintain safe systems of care, in which safety is managed, monitored and assured. We ensure continuity of care, including when people move between different services.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE'],
  },
  {
    id: 'S3',
    keyQuestion: 'SAFE',
    title: 'Safeguarding',
    topicId: 'safeguarding',
    description: 'We work with people to understand what being safe means to them and the best way to achieve that, concentrating on improving people\'s lives while protecting their right to live in safety.',
    regulationKeys: ['CQC:REG:SAFEGUARDING', 'CQC:QS:SAFE'],
  },
  {
    id: 'S4',
    keyQuestion: 'SAFE',
    title: 'Involving People to Manage Risks',
    topicId: 'involving-people-manage-risks',
    description: 'We work with people to understand and manage risks by thinking holistically so that care is safe and supportive. Care and treatment is provided in a way that promotes choice and involves people in decisions about their care.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE'],
  },
  {
    id: 'S5',
    keyQuestion: 'SAFE',
    title: 'Safe Environments',
    topicId: 'safe-environments',
    description: 'We detect and control potential risks in the care environment. We make sure the equipment, facilities and technology support the delivery of safe care.',
    regulationKeys: ['CQC:REG:PREMISES', 'CQC:QS:SAFE'],
  },
  {
    id: 'S6',
    keyQuestion: 'SAFE',
    title: 'Safe and Effective Staffing',
    topicId: 'safe-effective-staffing',
    description: 'We make sure there are enough qualified, skilled and experienced people who are recruited, deployed and supported to provide safe care and treatment.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:SAFE'],
  },
  {
    id: 'S7',
    keyQuestion: 'SAFE',
    title: 'Infection Prevention and Control',
    topicId: 'infection-prevention-control',
    description: 'We assess and manage the risk of infection. We detect and control the risk of it spreading and share any concerns with appropriate agencies promptly.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE', 'CQC:REG:IPC'],
  },
  {
    id: 'S8',
    keyQuestion: 'SAFE',
    title: 'Medicines Optimisation',
    topicId: 'medicines-optimisation',
    description: 'We make sure that medicines and treatments are safe and meet people\'s needs, capacities and preferences. We involve them in planning, including when changes are needed.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:SAFE', 'CQC:REG:MEDICINES'],
  },

  // ── Effective (E1–E6) ─────────────────────────────────────────
  {
    id: 'E1',
    keyQuestion: 'EFFECTIVE',
    title: 'Assessing Needs',
    topicId: 'assessing-needs',
    description: 'We maximise the effectiveness of people\'s care and treatment by assessing and reviewing their health, care, wellbeing and communication needs with them.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E2',
    keyQuestion: 'EFFECTIVE',
    title: 'Delivering Evidence-Based Care and Treatment',
    topicId: 'evidence-based-care',
    description: 'We plan and deliver people\'s care and treatment with them, including what is important and matters to them. We do this in line with legislation and current evidence-based good practice and standards.',
    regulationKeys: ['CQC:REG:SAFE_CARE', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E3',
    keyQuestion: 'EFFECTIVE',
    title: 'How Staff, Teams and Services Work Together',
    topicId: 'staff-teams-work-together',
    description: 'We make sure that everyone who is involved in people\'s care and treatment works together effectively. Staff and teams have the information they need for safe care.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E4',
    keyQuestion: 'EFFECTIVE',
    title: 'Supporting People to Live Healthier Lives',
    topicId: 'supporting-healthier-lives',
    description: 'We support people to manage their health and wellbeing to maximise their independence, choice and control, supporting them to live healthier lives and where possible reduce their future needs for care and support.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E5',
    keyQuestion: 'EFFECTIVE',
    title: 'Monitoring and Improving Outcomes',
    topicId: 'monitoring-improving-outcomes',
    description: 'We routinely monitor people\'s care and treatment to continuously improve it. We ensure that outcomes are positive and consistent, and that they meet both clinical expectations and the expectations of people themselves.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:EFFECTIVE'],
  },
  {
    id: 'E6',
    keyQuestion: 'EFFECTIVE',
    title: 'Consent to Care and Treatment',
    topicId: 'consent-to-care',
    description: 'We tell people about their rights around consent and respect these when we plan and deliver their care and treatment. We make sure people have enough information to give informed consent and understand what giving consent means.',
    regulationKeys: ['CQC:REG:CONSENT', 'CQC:QS:EFFECTIVE'],
  },

  // ── Caring (C1–C5) ───────────────────────────────────────────
  {
    id: 'C1',
    keyQuestion: 'CARING',
    title: 'Kindness, Compassion and Dignity',
    topicId: 'kindness-compassion-dignity',
    description: 'We always treat people with kindness, empathy and compassion and we respect their privacy and dignity. We treat colleagues and each other with kindness and work together to deliver compassionate, person-centred care.',
    regulationKeys: ['CQC:REG:DIGNITY', 'CQC:QS:CARING'],
  },
  {
    id: 'C2',
    keyQuestion: 'CARING',
    title: 'Treating People as Individuals',
    topicId: 'treating-people-as-individuals',
    description: 'We make sure we treat people as individuals and make sure their care, support and treatment meets their needs and preferences. We take account of their strengths, abilities, aspirations, culture and unique backgrounds and protected characteristics.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:CARING'],
  },
  {
    id: 'C3',
    keyQuestion: 'CARING',
    title: 'Independence, Choice and Control',
    topicId: 'independence-choice-control',
    description: 'We promote people\'s independence, so they know their rights and have choice and control over their own care, treatment and wellbeing.',
    regulationKeys: ['CQC:REG:DIGNITY', 'CQC:QS:CARING'],
  },
  {
    id: 'C4',
    keyQuestion: 'CARING',
    title: 'Responding to People\'s Immediate Needs',
    topicId: 'responding-immediate-needs',
    description: 'We listen to and understand people\'s needs, views and wishes. We respond to these in the moment and act to minimise any discomfort, concern or distress.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:CARING'],
  },
  {
    id: 'C5',
    keyQuestion: 'CARING',
    title: 'Workforce Wellbeing and Enablement',
    topicId: 'workforce-wellbeing-enablement',
    description: 'We care about and promote the wellbeing of our staff and support and enable them to always deliver person-centred care.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:CARING'],
  },

  // ── Responsive (R1–R7) ───────────────────────────────────────
  {
    id: 'R1',
    keyQuestion: 'RESPONSIVE',
    title: 'Person-Centred Care',
    topicId: 'person-centred-care',
    description: 'We make sure people are at the centre of their care and treatment choices and we decide, together with them, how to respond to any relevant changes in their needs.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R2',
    keyQuestion: 'RESPONSIVE',
    title: 'Care Provision, Integration and Continuity',
    topicId: 'care-continuity-integration',
    description: 'We understand the diverse health and care needs of people and our local communities, so care is joined up, flexible and supports choice and continuity.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R3',
    keyQuestion: 'RESPONSIVE',
    title: 'Providing Information',
    topicId: 'providing-information',
    description: 'We provide appropriate, accurate and up-to-date information in formats that we tailor to individual needs.',
    regulationKeys: ['CQC:REG:DUTY_OF_CANDOUR', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R4',
    keyQuestion: 'RESPONSIVE',
    title: 'Listening to and Involving People',
    topicId: 'listening-involving-people',
    description: 'We make it easy for people to share feedback and ideas, or raise complaints about their care, treatment or support. We involve them in decisions about their care and tell them what\'s changed as a result.',
    regulationKeys: ['CQC:REG:COMPLAINTS', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R5',
    keyQuestion: 'RESPONSIVE',
    title: 'Equity in Access',
    topicId: 'equity-in-access',
    description: 'We make sure that people can access the care, support and treatment they need when they need it. We take account of any inequalities and barriers and make arrangements to meet people\'s individual needs.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R6',
    keyQuestion: 'RESPONSIVE',
    title: 'Equity in Experiences and Outcomes',
    topicId: 'equity-experiences-outcomes',
    description: 'We actively seek out and listen to information about people who are most likely to experience inequality in experience or outcomes. We tailor the care, support and treatment in response to this.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:RESPONSIVE'],
  },
  {
    id: 'R7',
    keyQuestion: 'RESPONSIVE',
    title: 'Planning for the Future',
    topicId: 'planning-for-future',
    description: 'We support people to plan for important life changes, so they can have enough time to make informed decisions about their care, treatment and support, including at the end of their life.',
    regulationKeys: ['CQC:REG:PERSON_CENTRED', 'CQC:QS:RESPONSIVE'],
  },

  // ── Well-Led (W1–W8) ─────────────────────────────────────────
  {
    id: 'W1',
    keyQuestion: 'WELL_LED',
    title: 'Shared Direction and Culture',
    topicId: 'shared-direction-culture',
    description: 'We have a shared vision, strategy and culture. This is based on transparency, equity, equality and human rights, diversity and inclusion, engagement, and understanding challenges and the needs of people and our workforce.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W2',
    keyQuestion: 'WELL_LED',
    title: 'Capable, Compassionate and Inclusive Leaders',
    topicId: 'capable-compassionate-leaders',
    description: 'We have inclusive leaders at all levels who understand the context in which we deliver care, treatment and support and have the experience, capacity, capability and integrity to ensure the vision is delivered.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W3',
    keyQuestion: 'WELL_LED',
    title: 'Freedom to Speak Up',
    topicId: 'freedom-to-speak-up',
    description: 'We foster a positive culture where people feel they can speak up and their voice will be heard.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W4',
    keyQuestion: 'WELL_LED',
    title: 'Workforce Equality, Diversity and Inclusion',
    topicId: 'workforce-edi',
    description: 'We value diversity in our workforce. We work towards an inclusive and fair culture by improving equality and equity for people who work for us.',
    regulationKeys: ['CQC:REG:STAFFING', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W5',
    keyQuestion: 'WELL_LED',
    title: 'Governance, Management and Sustainability',
    topicId: 'governance-management-sustainability',
    description: 'We have clear responsibilities, roles, systems of accountability and good governance. We use these to manage and deliver good quality, sustainable care, treatment and support. We act on the best information about risk, performance and outcomes, and share this securely with others when appropriate.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W6',
    keyQuestion: 'WELL_LED',
    title: 'Partnerships and Communities',
    topicId: 'partnerships-communities',
    description: 'We understand our duty to collaborate and work in partnership, so our services work seamlessly for people. We share information and learning with partners and collaborate for improvement.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W7',
    keyQuestion: 'WELL_LED',
    title: 'Learning, Improvement and Innovation',
    topicId: 'learning-improvement-innovation',
    description: 'We focus on continuous learning, innovation and improvement across our organisation and the local system. We encourage creative ways of delivering equality of experience, outcome and quality of life for people.',
    regulationKeys: ['CQC:REG:GOVERNANCE', 'CQC:QS:WELL_LED'],
  },
  {
    id: 'W8',
    keyQuestion: 'WELL_LED',
    title: 'Environmental Sustainability',
    topicId: 'environmental-sustainability',
    description: 'We understand any negative impact our organisation has on the environment and strive to make a positive contribution to sustainability.',
    regulationKeys: ['CQC:REG:PREMISES', 'CQC:QS:WELL_LED'],
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
