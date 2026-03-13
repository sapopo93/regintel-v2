/**
 * Service Type → Topic Mapping
 *
 * Maps CQC service types to their applicable inspection topics.
 * Different service types have different regulatory requirements —
 * e.g., domiciliary care doesn't have premises, nursing homes need
 * all topics.
 *
 * Unknown/undefined service types get all 34 topics (backward compat).
 *
 * Topic IDs are 1:1 with the CQC SAF 34 Quality Statements.
 */

import { EvidenceType } from './evidence-types';

export enum CqcServiceType {
  RESIDENTIAL = 'residential',
  NURSING = 'nursing',
  DOMICILIARY = 'domiciliary',
  HOSPICE = 'hospice',
  SUPPORTED_LIVING = 'supported_living',
}

/** All 34 topic IDs in the system — 1:1 with CQC SAF Quality Statements */
export const ALL_TOPIC_IDS: readonly string[] = [
  // SAFE (S1–S8)
  'learning-culture',
  'safe-systems-pathways-transitions',
  'safeguarding',
  'involving-people-manage-risks',
  'safe-environments',
  'safe-effective-staffing',
  'infection-prevention-control',
  'medicines-optimisation',
  // EFFECTIVE (E1–E6)
  'assessing-needs',
  'evidence-based-care',
  'staff-teams-work-together',
  'supporting-healthier-lives',
  'monitoring-improving-outcomes',
  'consent-to-care',
  // CARING (C1–C5)
  'kindness-compassion-dignity',
  'treating-people-as-individuals',
  'independence-choice-control',
  'responding-immediate-needs',
  'workforce-wellbeing-enablement',
  // RESPONSIVE (R1–R7)
  'person-centred-care',
  'care-continuity-integration',
  'providing-information',
  'listening-involving-people',
  'equity-in-access',
  'equity-experiences-outcomes',
  'planning-for-future',
  // WELL-LED (W1–W8)
  'shared-direction-culture',
  'capable-compassionate-leaders',
  'freedom-to-speak-up',
  'workforce-edi',
  'governance-management-sustainability',
  'partnerships-communities',
  'learning-improvement-innovation',
  'environmental-sustainability',
] as const;

/** Topics excluded for domiciliary care (no owned premises) */
const DOMICILIARY_EXCLUDED = new Set([
  'safe-environments',
]);

/** Topics excluded for supported living (no owned premises) */
const SUPPORTED_LIVING_EXCLUDED = new Set([
  'safe-environments',
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
  if (!mapped) {
    console.warn(`[SERVICE-TYPE] Unknown service type "${serviceType}" — falling back to all ${ALL_TOPIC_IDS.length} topics`);
    return [...ALL_TOPIC_IDS];
  }
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
