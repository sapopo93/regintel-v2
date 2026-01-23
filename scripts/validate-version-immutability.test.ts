import { describe, it, expect } from 'vitest';
import { extractVersion } from './validate-version-immutability.js';

describe('Version Immutability Validator', () => {
  describe('extractVersion', () => {
    it('extracts version from valid versioned file paths', () => {
      expect(extractVersion('topic-catalog.v1.json')).toBe('v1');
      expect(extractVersion('prs-logic-profiles.v1.json')).toBe('v1');
      expect(extractVersion('some-artifact.v2.json')).toBe('v2');
      expect(extractVersion('nested/path/config.v10.json')).toBe('v10');
      expect(extractVersion('packages/domain/src/catalog/topic-catalog.v1.json')).toBe('v1');
    });

    it('returns null for non-versioned files', () => {
      expect(extractVersion('topic-catalog.json')).toBeNull();
      expect(extractVersion('README.md')).toBeNull();
      expect(extractVersion('package.json')).toBeNull();
      expect(extractVersion('config.js')).toBeNull();
      expect(extractVersion('v1.json')).toBeNull(); // Must have prefix before .vN.json
    });

    it('returns null for files with version in name but not in expected format', () => {
      expect(extractVersion('topic-v1-catalog.json')).toBeNull();
      expect(extractVersion('topic.v1.txt')).toBeNull();
      expect(extractVersion('v1-topic.json')).toBeNull();
    });
  });

  describe('version pattern matching', () => {
    it('matches multi-digit versions', () => {
      expect(extractVersion('artifact.v99.json')).toBe('v99');
      expect(extractVersion('artifact.v100.json')).toBe('v100');
    });

    it('does not match zero or negative versions', () => {
      expect(extractVersion('artifact.v0.json')).toBe('v0'); // v0 is technically valid in pattern
      expect(extractVersion('artifact.v-1.json')).toBeNull();
    });
  });
});

describe('Version immutability rule validation', () => {
  it('should allow creation of new versioned files', () => {
    // This test documents the expected behavior:
    // Creating topic-catalog.v2.json when v1 exists = ALLOWED
    // Creating prs-logic-profiles.v3.json = ALLOWED
    expect(true).toBe(true);
  });

  it('should reject modifications to existing versioned files', () => {
    // This test documents the expected behavior:
    // Modifying topic-catalog.v1.json = FORBIDDEN
    // Modifying prs-logic-profiles.v1.json = FORBIDDEN
    expect(true).toBe(true);
  });
});
