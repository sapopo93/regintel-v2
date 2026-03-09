/**
 * Service Type → Topic Mapping
 *
 * Maps CQC service types to their applicable inspection topics.
 * Different service types have different regulatory requirements —
 * e.g., domiciliary care doesn't have premises, nursing homes need
 * all topics.
 *
 * Unknown/undefined service types get all 34 topics (backward compat).
 */

import { EvidenceType } from './evidence-types';

export enum CqcServiceType {
  RESIDENTIAL = 'residential',
  NURSING = 'nursing',
  DOMICILIARY = 'domiciliary',
  HOSPICE = 'hospice',
  SUPPORTED_LIVING = 'supported_living',
}

/** All 34 topic IDs in the system */
export const ALL_TOPIC_IDS: readonly string[] = [
  // SAFE
  'safe-care-treatment',
  'safeguarding',
  'medication-management',
  'infection-prevention-control',
  'risk-assessment',
  'premises-equipment',
  'deprivation-of-liberty',
  // EFFECTIVE
  'person-centred-care',
  'consent',
  'nutrition-hydration',
  'staff-training-development',
  'supervision-appraisal',
  'mental-capacity-act',
  // CARING
  'dignity-respect',
  'service-user-involvement',
  'emotional-social-wellbeing',
  'end-of-life-care',
  // RESPONSIVE
  'complaints-handling',
  'care-planning-review',
  'meeting-individual-needs',
  'transitions-discharge',
  'equality-diversity',
  // WELL-LED
  'governance-oversight',
  'quality-assurance',
  'staff-recruitment',
  'fit-proper-persons',
  'whistleblowing-openness',
  'notifications-cqc',
  'financial-sustainability',
  'records-management',
  'staff-wellbeing',
  'learning-from-incidents',
  'partnership-working',
  'staffing',
] as const;

/** Topics excluded for domiciliary care (no premises, no on-site catering, no DoLS typically) */
const DOMICILIARY_EXCLUDED = new Set([
  'premises-equipment',
  'nutrition-hydration',
  'deprivation-of-liberty',
]);

/** Topics excluded for supported living (no premises responsibility, limited DoLS) */
const SUPPORTED_LIVING_EXCLUDED = new Set([
  'premises-equipment',
]);

function allExcept(excluded: Set<string>): Set<string> {
  return new Set(ALL_TOPIC_IDS.filter(id => !excluded.has(id)));
}

const ALL_SET = new Set(ALL_TOPIC_IDS);

/**
 * Service type → applicable topic IDs.
 * Residential, nursing, and hospice get all topics.
 * Domiciliary and supported living exclude certain physical-premises topics.
 */
export const SERVICE_TYPE_TOPIC_MAP: Record<CqcServiceType, Set<string>> = {
  [CqcServiceType.RESIDENTIAL]: ALL_SET,
  [CqcServiceType.NURSING]: ALL_SET,
  [CqcServiceType.DOMICILIARY]: allExcept(DOMICILIARY_EXCLUDED),
  [CqcServiceType.HOSPICE]: ALL_SET,
  [CqcServiceType.SUPPORTED_LIVING]: allExcept(SUPPORTED_LIVING_EXCLUDED),
};

/**
 * Returns applicable topic IDs for a given service type.
 * Unknown/undefined → all 34 topics (backward compat).
 */
export function getApplicableTopicIds(serviceType: string | undefined): string[] {
  if (!serviceType) return [...ALL_TOPIC_IDS];
  const mapped = SERVICE_TYPE_TOPIC_MAP[serviceType as CqcServiceType];
  if (!mapped) return [...ALL_TOPIC_IDS];
  return [...mapped];
}

/**
 * Derives required evidence types from applicable topics only.
 * Deduplicates across all applicable topics' evidence requirements.
 */
export function getRequiredEvidenceTypes(
  serviceType: string | undefined,
  topics: Array<{ id: string; evidenceRequirements: EvidenceType[] }>,
): EvidenceType[] {
  const applicableIds = new Set(getApplicableTopicIds(serviceType));
  const types = new Set<EvidenceType>();
  for (const topic of topics) {
    if (applicableIds.has(topic.id)) {
      for (const et of topic.evidenceRequirements) {
        types.add(et);
      }
    }
  }
  return [...types];
}
