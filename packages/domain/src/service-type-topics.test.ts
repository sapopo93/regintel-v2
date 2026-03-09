import { describe, it, expect } from 'vitest';
import {
  CqcServiceType,
  ALL_TOPIC_IDS,
  SERVICE_TYPE_TOPIC_MAP,
  getApplicableTopicIds,
  getRequiredEvidenceTypes,
} from './service-type-topics';
import { EvidenceType } from './evidence-types';

describe('service-type-topics', () => {
  describe('ALL_TOPIC_IDS', () => {
    it('contains exactly 34 topics', () => {
      expect(ALL_TOPIC_IDS).toHaveLength(34);
    });

    it('contains no duplicates', () => {
      const unique = new Set(ALL_TOPIC_IDS);
      expect(unique.size).toBe(ALL_TOPIC_IDS.length);
    });
  });

  describe('getApplicableTopicIds', () => {
    it('returns all 34 topics for undefined service type', () => {
      expect(getApplicableTopicIds(undefined)).toHaveLength(34);
    });

    it('returns all 34 topics for unknown service type', () => {
      expect(getApplicableTopicIds('unknown_type')).toHaveLength(34);
    });

    it('returns all 34 topics for residential', () => {
      expect(getApplicableTopicIds(CqcServiceType.RESIDENTIAL)).toHaveLength(34);
    });

    it('returns all 34 topics for nursing', () => {
      expect(getApplicableTopicIds(CqcServiceType.NURSING)).toHaveLength(34);
    });

    it('returns all 34 topics for hospice', () => {
      expect(getApplicableTopicIds(CqcServiceType.HOSPICE)).toHaveLength(34);
    });

    it('excludes premises/nutrition/DoLS for domiciliary', () => {
      const topics = getApplicableTopicIds(CqcServiceType.DOMICILIARY);
      expect(topics).toHaveLength(31);
      expect(topics).not.toContain('premises-equipment');
      expect(topics).not.toContain('nutrition-hydration');
      expect(topics).not.toContain('deprivation-of-liberty');
    });

    it('excludes premises for supported living', () => {
      const topics = getApplicableTopicIds(CqcServiceType.SUPPORTED_LIVING);
      expect(topics).toHaveLength(33);
      expect(topics).not.toContain('premises-equipment');
      expect(topics).toContain('nutrition-hydration');
    });
  });

  describe('SERVICE_TYPE_TOPIC_MAP', () => {
    it('every topic ID in mappings is a valid topic', () => {
      const allTopicSet = new Set(ALL_TOPIC_IDS);
      for (const [serviceType, topicSet] of Object.entries(SERVICE_TYPE_TOPIC_MAP)) {
        for (const topicId of topicSet) {
          expect(allTopicSet.has(topicId), `${topicId} in ${serviceType} is not a valid topic`).toBe(true);
        }
      }
    });

    it('covers all CqcServiceType enum values', () => {
      for (const st of Object.values(CqcServiceType)) {
        expect(SERVICE_TYPE_TOPIC_MAP[st], `Missing mapping for ${st}`).toBeDefined();
      }
    });
  });

  describe('getRequiredEvidenceTypes', () => {
    const mockTopics = [
      { id: 'safe-care-treatment', evidenceRequirements: [EvidenceType.POLICY, EvidenceType.TRAINING, EvidenceType.AUDIT] },
      { id: 'premises-equipment', evidenceRequirements: [EvidenceType.AUDIT, EvidenceType.CERTIFICATE] },
      { id: 'staffing', evidenceRequirements: [EvidenceType.ROTA, EvidenceType.SKILLS_MATRIX, EvidenceType.SUPERVISION] },
    ];

    it('returns all evidence types for undefined service type', () => {
      const types = getRequiredEvidenceTypes(undefined, mockTopics);
      expect(types).toContain(EvidenceType.CERTIFICATE);
      expect(types).toHaveLength(7); // POLICY, TRAINING, AUDIT, CERTIFICATE, ROTA, SKILLS_MATRIX, SUPERVISION
    });

    it('excludes evidence types from excluded topics for domiciliary', () => {
      const types = getRequiredEvidenceTypes(CqcServiceType.DOMICILIARY, mockTopics);
      // premises-equipment excluded → CERTIFICATE not required (only source)
      expect(types).not.toContain(EvidenceType.CERTIFICATE);
    });

    it('deduplicates evidence types', () => {
      const types = getRequiredEvidenceTypes(undefined, mockTopics);
      const unique = new Set(types);
      expect(unique.size).toBe(types.length);
    });
  });
});
