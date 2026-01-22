import { describe, it, expect } from 'vitest';
import { createRegulation, type Regulation } from './regulation.js';
import { detectRegulatoryDrift } from './drift-detector.js';
import {
  computeNormativityDelta,
  computeNormativityIndicators,
  ChangeClassification,
  verifyChangeEventIntegrity,
} from './regulatory-change-event.js';
import { Domain } from './types.js';

describe('drift:cosmetic', () => {
  describe('Cosmetic Change Detection', () => {
    it('typo classified as COSMETIC', () => {
      const oldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Fire Safety Regulation',
        sections: [
          {
            sectionId: '8.1',
            title: 'Fire Evacuation',
            content:
              'Providers must mantain fire evacuation procedures at all times.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Fire Safety Regulation',
        sections: [
          {
            sectionId: '8.1',
            title: 'Fire Evacuation',
            content:
              'Providers must maintain fire evacuation procedures at all times.', // Fixed typo: mantain → maintain
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      expect(changeEvent.sectionChanges).toHaveLength(1);

      const change = changeEvent.sectionChanges[0];
      expect(change.sectionId).toBe('8.1');
      expect(change.classification).toBe(ChangeClassification.COSMETIC);
      expect(change.normativityDelta).toBe(0); // No change in requirement strength
    });

    it('formatting change classified appropriately', () => {
      const oldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Medication Management',
        sections: [
          {
            sectionId: '10.1',
            title: 'Storage',
            content: 'Medications must be stored securely.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Medication Management',
        sections: [
          {
            sectionId: '10.1',
            title: 'Storage',
            content: 'Medications  must  be  stored  securely.', // Extra spaces (formatting)
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      expect(changeEvent.sectionChanges).toHaveLength(1);
      const change = changeEvent.sectionChanges[0];

      // Formatting changes are MINOR (not significant enough to warrant COSMETIC)
      expect(change.classification).toBe(ChangeClassification.MINOR);
      expect(change.normativityDelta).toBe(0);
    });

    it('minor clarification classified as MINOR', () => {
      const oldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Staff Training',
        sections: [
          {
            sectionId: '12.1',
            title: 'Training Requirements',
            content: 'Staff must complete training annually.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Staff Training',
        sections: [
          {
            sectionId: '12.1',
            title: 'Training Requirements',
            content: 'All staff must complete training annually.', // Added "All" for clarity
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      expect(changeEvent.sectionChanges).toHaveLength(1);
      const change = changeEvent.sectionChanges[0];

      expect(change.classification).toBe(ChangeClassification.MINOR);
      expect(change.normativityDelta).toBe(0);
    });
  });
});

describe('drift:normative', () => {
  describe('Normative Change Detection', () => {
    it('should→must classified as NORMATIVE', () => {
      const oldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Safeguarding Policy',
        sections: [
          {
            sectionId: '5.1',
            title: 'Background Checks',
            content:
              'Providers should conduct DBS checks on all staff before employment.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Safeguarding Policy',
        sections: [
          {
            sectionId: '5.1',
            title: 'Background Checks',
            content:
              'Providers must conduct DBS checks on all staff before employment.', // should → must
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      expect(changeEvent.sectionChanges).toHaveLength(1);

      const change = changeEvent.sectionChanges[0];
      expect(change.sectionId).toBe('5.1');
      expect(change.classification).toBe(ChangeClassification.NORMATIVE);
      expect(change.normativityDelta).toBe(1); // Requirements strengthened
      expect(change.reasoning).toContain('strengthened');
    });

    it('must→should classified as NORMATIVE (weakening)', () => {
      const oldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Record Keeping',
        sections: [
          {
            sectionId: '14.2',
            title: 'Documentation',
            content: 'Records must be kept for 10 years.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Record Keeping',
        sections: [
          {
            sectionId: '14.2',
            title: 'Documentation',
            content: 'Records should be kept for 10 years.', // must → should
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      expect(changeEvent.sectionChanges).toHaveLength(1);

      const change = changeEvent.sectionChanges[0];
      expect(change.classification).toBe(ChangeClassification.NORMATIVE);
      expect(change.normativityDelta).toBe(-1); // Requirements weakened
      expect(change.reasoning).toContain('weakened');
    });

    it('addition of "must not" classified as NORMATIVE', () => {
      const oldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Staff Conduct',
        sections: [
          {
            sectionId: '7.3',
            title: 'Professional Boundaries',
            content: 'Staff should maintain professional boundaries with residents.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Staff Conduct',
        sections: [
          {
            sectionId: '7.3',
            title: 'Professional Boundaries',
            content:
              'Staff must not engage in personal relationships with residents.', // Added prohibition
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const changeEvent = detectRegulatoryDrift(oldReg, newReg);

      expect(changeEvent.sectionChanges).toHaveLength(1);

      const change = changeEvent.sectionChanges[0];
      expect(change.classification).toBe(ChangeClassification.NORMATIVE);
      expect(change.normativityDelta).toBe(1); // Prohibition is a strong requirement
    });
  });

  describe('Normativity Indicator Calculation', () => {
    it('counts modal verbs correctly', () => {
      const text =
        'Providers must ensure staff are trained. Staff should attend refresher courses. Providers may offer additional training.';

      const indicators = computeNormativityIndicators(text);

      expect(indicators.mustCount).toBe(1); // "must"
      expect(indicators.shouldCount).toBe(1); // "should"
      expect(indicators.mayCount).toBe(1); // "may"
    });

    it('counts prohibitions correctly', () => {
      const text = 'Staff must not share confidential information. Data shall not be disclosed.';

      const indicators = computeNormativityIndicators(text);

      expect(indicators.prohibitionCount).toBe(2); // "must not", "shall not"
    });

    it('computes delta correctly for strengthening', () => {
      const oldText = 'Providers should maintain records.';
      const newText = 'Providers must maintain records.';

      const delta = computeNormativityDelta(oldText, newText);

      expect(delta).toBe(1); // Strengthened
    });

    it('computes delta correctly for weakening', () => {
      const oldText = 'Providers must conduct audits.';
      const newText = 'Providers should conduct audits.';

      const delta = computeNormativityDelta(oldText, newText);

      expect(delta).toBe(-1); // Weakened
    });

    it('computes delta as 0 for no change', () => {
      const oldText = 'Providers must maintain standards.';
      const newText = 'Providers must uphold standards.'; // Different words, same "must"

      const delta = computeNormativityDelta(oldText, newText);

      expect(delta).toBe(0); // Same strength
    });
  });
});

describe('drift:determinism', () => {
  describe('Deterministic Change Detection', () => {
    it('same inputs produce same RegulatoryChangeEvent hash', () => {
      const oldReg: Regulation = createRegulation({
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
            content: 'Original content with must requirement.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
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
            content: 'Updated content with must requirement.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      // Run detection twice
      const event1 = detectRegulatoryDrift(oldReg, newReg);
      const event2 = detectRegulatoryDrift(oldReg, newReg);

      // Hashes should be identical
      expect(event1.changeHash).toBe(event2.changeHash);

      // Section changes should be identical
      expect(event1.sectionChanges).toHaveLength(event2.sectionChanges.length);

      for (let i = 0; i < event1.sectionChanges.length; i++) {
        const change1 = event1.sectionChanges[i];
        const change2 = event2.sectionChanges[i];

        expect(change1.sectionId).toBe(change2.sectionId);
        expect(change1.classification).toBe(change2.classification);
        expect(change1.normativityDelta).toBe(change2.normativityDelta);
      }
    });

    it('change hash verified by verifyChangeEventIntegrity', () => {
      const oldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Test Regulation',
        sections: [
          {
            sectionId: '2.1',
            title: 'Section Two',
            content: 'Providers should maintain documentation.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Test Regulation',
        sections: [
          {
            sectionId: '2.1',
            title: 'Section Two',
            content: 'Providers must maintain documentation.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const event = detectRegulatoryDrift(oldReg, newReg);

      const isValid = verifyChangeEventIntegrity(event);
      expect(isValid).toBe(true);
    });

    it('different inputs produce different hashes', () => {
      const baseOldReg: Regulation = createRegulation({
        id: 'reg-v1',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 1,
        effectiveDate: '2024-01-01T00:00:00Z',
        supersedes: null,
        title: 'Test Regulation',
        sections: [
          {
            sectionId: '3.1',
            title: 'Section Three',
            content: 'Original content.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg1: Regulation = createRegulation({
        id: 'reg-v2',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 2,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Test Regulation',
        sections: [
          {
            sectionId: '3.1',
            title: 'Section Three',
            content: 'Updated content A.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const newReg2: Regulation = createRegulation({
        id: 'reg-v3',
        tenantId: 'tenant-a',
        domain: Domain.CQC,
        version: 3,
        effectiveDate: '2024-06-01T00:00:00Z',
        supersedes: 'reg-v1',
        title: 'Test Regulation',
        sections: [
          {
            sectionId: '3.1',
            title: 'Section Three',
            content: 'Updated content B.',
            normative: true,
          },
        ],
        createdBy: 'system',
      });

      const event1 = detectRegulatoryDrift(baseOldReg, newReg1);
      const event2 = detectRegulatoryDrift(baseOldReg, newReg2);

      // Different content should produce different hashes
      expect(event1.changeHash).not.toBe(event2.changeHash);
    });
  });
});
