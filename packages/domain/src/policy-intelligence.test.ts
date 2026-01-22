import { describe, it, expect } from 'vitest';
import {
  createRegulationPolicyLink,
  deprecateLink,
  supersedeLink,
  LinkStatus,
  type RegulationPolicyLink,
} from './regulation-policy-link.js';
import { createRegulation, type Regulation } from './regulation.js';
import { detectRegulatoryDrift } from './drift-detector.js';
import {
  createImpactAssessment,
  determineMigrationRecommendation,
  MigrationRecommendation,
  verifyAssessmentIntegrity,
} from './impact-assessment.js';
import {
  applyMigrationRecommendations,
  validateNonDestructiveMigration,
} from './policy-intelligence.js';
import { Domain } from './types.js';

describe('policy-intel:edges', () => {
  describe('Non-Destructive Edge Management', () => {
    it('edges deprecated, never overwritten', () => {
      // Create original link
      const originalLink = createRegulationPolicyLink({
        id: 'link-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '8.1',
        policyId: 'policy-1',
        policyClauseId: '2.1',
        rationale: 'Maps fire safety policy to regulation',
        createdBy: 'user-1',
      });

      expect(originalLink.status).toBe(LinkStatus.ACTIVE);

      // Deprecate the link (non-destructive)
      const deprecatedLink = deprecateLink(originalLink, 'Regulation updated');

      // Original link data is preserved
      expect(deprecatedLink.id).toBe(originalLink.id);
      expect(deprecatedLink.regulationId).toBe(originalLink.regulationId);
      expect(deprecatedLink.policyId).toBe(originalLink.policyId);

      // Status changed to DEPRECATED
      expect(deprecatedLink.status).toBe(LinkStatus.DEPRECATED);
      expect(deprecatedLink.deprecatedAt).toBeDefined();
      expect(deprecatedLink.deprecatedReason).toBe('Regulation updated');

      // Edge hash unchanged (same endpoints)
      expect(deprecatedLink.edgeHash).toBe(originalLink.edgeHash);
    });

    it('old links never deleted, only marked deprecated', () => {
      const link1 = createRegulationPolicyLink({
        id: 'link-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '10.1',
        policyId: 'policy-1',
        policyClauseId: '3.1',
        createdBy: 'user-1',
      });

      const link2 = createRegulationPolicyLink({
        id: 'link-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '10.2',
        policyId: 'policy-1',
        policyClauseId: '3.2',
        createdBy: 'user-1',
      });

      const linksBefore = [link1, link2];

      // Deprecate one link
      const deprecatedLink1 = deprecateLink(link1, 'Section removed');

      // After deprecation, both links still exist
      const linksAfter = [deprecatedLink1, link2];

      expect(linksAfter).toHaveLength(2);
      expect(linksAfter.find((l) => l.id === 'link-1')).toBeDefined();
      expect(linksAfter.find((l) => l.id === 'link-2')).toBeDefined();

      // Validate non-destructive migration
      const validation = validateNonDestructiveMigration({
        linksBefore,
        linksAfter,
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('superseded links create new links, preserve old ones', () => {
      const oldLink = createRegulationPolicyLink({
        id: 'link-old',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '12.1',
        policyId: 'policy-1',
        policyClauseId: '5.1',
        createdBy: 'user-1',
      });

      const newLink = createRegulationPolicyLink({
        id: 'link-new',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v2', // New regulation version
        regulationSectionId: '12.1',
        policyId: 'policy-1',
        policyClauseId: '5.1',
        createdBy: 'user-1',
      });

      const supersededOldLink = supersedeLink(oldLink, newLink);

      // Old link preserved with SUPERSEDED status
      expect(supersededOldLink.id).toBe('link-old');
      expect(supersededOldLink.status).toBe(LinkStatus.SUPERSEDED);
      expect(supersededOldLink.supersededBy).toBe('link-new');

      // Both links exist
      const allLinks = [supersededOldLink, newLink];
      expect(allLinks).toHaveLength(2);
    });

    it('detects deletion violations', () => {
      const link1 = createRegulationPolicyLink({
        id: 'link-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '8.1',
        policyId: 'policy-1',
        policyClauseId: '2.1',
        createdBy: 'user-1',
      });

      const linksBefore = [link1];
      const linksAfter: RegulationPolicyLink[] = []; // Link deleted (BAD!)

      const validation = validateNonDestructiveMigration({
        linksBefore,
        linksAfter,
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0]).toContain('was deleted');
    });
  });
});

describe('policy-intel:migrations', () => {
  describe('Migration Decision Determinism', () => {
    it('KEEP/UPDATE/SPLIT/MERGE decisions deterministic', () => {
      // Create old and new regulation versions
      const oldReg = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Test Regulation',
        sections: [
          {
            sectionId: '1.1',
            title: 'Section One',
            content: 'Providers should maintain records.',
            normative: true,
          },
          {
            sectionId: '1.2',
            title: 'Section Two',
            content: 'Providers must report incidents.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Test Regulation',
        sections: [
          {
            sectionId: '1.1',
            title: 'Section One',
            content: 'Providers must maintain records.', // should → must (NORMATIVE)
            normative: true,
          },
          {
            sectionId: '1.2',
            title: 'Section Two',
            content: 'Providers must report incidents.', // Unchanged
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      // Detect drift
      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      // Create links
      const link1 = createRegulationPolicyLink({
        id: 'link-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '1.1',
        policyId: 'policy-1',
        policyClauseId: '2.1',
        createdBy: 'user-1',
      });

      const link2 = createRegulationPolicyLink({
        id: 'link-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '1.2',
        policyId: 'policy-1',
        policyClauseId: '2.2',
        createdBy: 'user-1',
      });

      // Run assessment twice with same inputs
      const assessment1 = createImpactAssessment({
        id: 'assessment-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        changeEvent,
        affectedLinks: [link1, link2],
        createdBy: 'SYSTEM',
      });

      const assessment2 = createImpactAssessment({
        id: 'assessment-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        changeEvent,
        affectedLinks: [link1, link2],
        createdBy: 'SYSTEM',
      });

      // Recommendations should be identical
      expect(assessment1.items).toHaveLength(2);
      expect(assessment2.items).toHaveLength(2);

      // Link 1 (NORMATIVE change) → UPDATE
      expect(assessment1.items[0].recommendation).toBe(MigrationRecommendation.UPDATE);
      expect(assessment2.items[0].recommendation).toBe(MigrationRecommendation.UPDATE);

      // Link 2 (no change) → KEEP
      expect(assessment1.items[1].recommendation).toBe(MigrationRecommendation.KEEP);
      expect(assessment2.items[1].recommendation).toBe(MigrationRecommendation.KEEP);

      // Confidences should be identical
      expect(assessment1.items[0].confidence).toBe(assessment2.items[0].confidence);
      expect(assessment1.items[1].confidence).toBe(assessment2.items[1].confidence);
    });

    it('COSMETIC changes result in KEEP decision', () => {
      const oldReg = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Test',
        sections: [
          {
            sectionId: '2.1',
            title: 'Test',
            content: 'Providers must maintian records.', // Typo
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Test',
        sections: [
          {
            sectionId: '2.1',
            title: 'Test',
            content: 'Providers must maintain records.', // Fixed typo
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      const link = createRegulationPolicyLink({
        id: 'link-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '2.1',
        policyId: 'policy-1',
        policyClauseId: '1.1',
        createdBy: 'user-1',
      });

      const recommendation = determineMigrationRecommendation({
        link,
        changeEvent,
      });

      expect(recommendation.recommendation).toBe(MigrationRecommendation.KEEP);
      expect(recommendation.confidence).toBe(1.0);
    });

    it('REMOVED sections result in REMOVE decision', () => {
      const oldReg = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Test',
        sections: [
          {
            sectionId: '3.1',
            title: 'Removed Section',
            content: 'This will be removed.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Test',
        sections: [], // Section removed
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      const link = createRegulationPolicyLink({
        id: 'link-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '3.1',
        policyId: 'policy-1',
        policyClauseId: '1.1',
        createdBy: 'user-1',
      });

      const recommendation = determineMigrationRecommendation({
        link,
        changeEvent,
      });

      expect(recommendation.recommendation).toBe(MigrationRecommendation.REMOVE);
      expect(recommendation.confidence).toBe(1.0);
    });

    it('assessment hash is deterministic', () => {
      const oldReg = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Test',
        sections: [
          {
            sectionId: '4.1',
            title: 'Test',
            content: 'Content here.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Test',
        sections: [
          {
            sectionId: '4.1',
            title: 'Test',
            content: 'Updated content.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      const link = createRegulationPolicyLink({
        id: 'link-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        regulationId: 'reg-v1',
        regulationSectionId: '4.1',
        policyId: 'policy-1',
        policyClauseId: '1.1',
        createdBy: 'user-1',
      });

      const assessment1 = createImpactAssessment({
        id: 'assessment-1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        changeEvent,
        affectedLinks: [link],
        createdBy: 'SYSTEM',
      });

      const assessment2 = createImpactAssessment({
        id: 'assessment-2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        changeEvent,
        affectedLinks: [link],
        createdBy: 'SYSTEM',
      });

      // Hashes should be identical (deterministic)
      expect(assessment1.assessmentHash).toBe(assessment2.assessmentHash);

      // Verify integrity
      expect(verifyAssessmentIntegrity(assessment1)).toBe(true);
      expect(verifyAssessmentIntegrity(assessment2)).toBe(true);
    });
  });
});
