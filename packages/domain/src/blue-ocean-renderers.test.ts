/**
 * Phase 11 Gate Tests: Blue Ocean Renderers
 */

import { describe, it, expect } from 'vitest';
import { generateBlueOceanReport } from './blue-ocean-report.js';
import {
  serializeBlueOceanBoardMarkdown,
  serializeBlueOceanAuditMarkdown,
} from './blue-ocean-renderers.js';
import { blueOceanFixtureInput } from './fixtures/blue-ocean-golden.fixture.js';

const ISO_PATTERN = /\d{4}-\d{2}-\d{2}T/;
const HASH_64_PATTERN = /[a-f0-9]{64}/i;

describe('blue-ocean:renderers', () => {
  it('board pack hides hashes, ISO timestamps, and MOCK_SIMULATION jargon', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const board = serializeBlueOceanBoardMarkdown(report);

    expect(board).not.toMatch(HASH_64_PATTERN);
    expect(board).not.toMatch(/sha256:/i);
    expect(board).not.toMatch(ISO_PATTERN);
    expect(board).not.toContain('MOCK_SIMULATION');
  });

  it('board pack contains assurance, reference code, and golden thread', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const board = serializeBlueOceanBoardMarkdown(report);

    expect(board).toContain('Reference Code:');
    expect(board).toContain('Mock Inspection Simulation');
    expect(board).toContain('How we know we\u2019re safe');
    expect(board).toContain('Golden Thread');
  });

  it('audit pack includes report hash, metadata, evidence hashes, and raw domain values', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const audit = serializeBlueOceanAuditMarkdown(report);

    expect(audit).toContain(report.reportId);
    expect(audit).toContain('topicCatalogVersion');
    expect(audit).toContain('primaryBlobHash');
    expect(audit).toContain('MOCK_SIMULATION');
    expect(audit).toMatch(HASH_64_PATTERN);
  });

  it('rendering is deterministic', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const boardA = serializeBlueOceanBoardMarkdown(report);
    const boardB = serializeBlueOceanBoardMarkdown(report);
    const auditA = serializeBlueOceanAuditMarkdown(report);
    const auditB = serializeBlueOceanAuditMarkdown(report);

    expect(boardA).toBe(boardB);
    expect(auditA).toBe(auditB);
  });

  it('never emits [object Object]', () => {
    const report = generateBlueOceanReport(blueOceanFixtureInput);
    const board = serializeBlueOceanBoardMarkdown(report);
    const audit = serializeBlueOceanAuditMarkdown(report);

    expect(board).not.toContain('[object Object]');
    expect(audit).not.toContain('[object Object]');
  });
});
