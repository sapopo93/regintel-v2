import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveDependencyChain,
  buildTestPlan,
  findUnexpectedSrcFiles,
  type Phase,
  type PhaseGatesConfig,
} from './gate.js';

// Helper to create test phases
function createPhases(defs: Record<string, string[]>): Record<string, Phase> {
  const phases: Record<string, Phase> = {};
  for (const [id, deps] of Object.entries(defs)) {
    phases[id] = {
      description: `Test phase ${id}`,
      depends_on: deps,
      required_tests: [
        { id: `test_${id}`, command: `echo ${id}`, asserts: [] },
      ],
      blocks_next_phase_on_failure: true,
    };
  }
  return phases;
}

describe('resolveDependencyChain', () => {
  it('returns single phase with no dependencies', () => {
    const phases = createPhases({
      phase0: [],
    });

    const result = resolveDependencyChain(phases, 'phase0');
    expect(result).toEqual(['phase0']);
  });

  it('returns phase with one dependency in correct order', () => {
    const phases = createPhases({
      phase0: [],
      phase1: ['phase0'],
    });

    const result = resolveDependencyChain(phases, 'phase1');
    expect(result).toEqual(['phase0', 'phase1']);
  });

  it('handles deep dependency chain', () => {
    const phases = createPhases({
      phase0: [],
      phase1: ['phase0'],
      phase2: ['phase1'],
    });

    const result = resolveDependencyChain(phases, 'phase2');
    expect(result).toEqual(['phase0', 'phase1', 'phase2']);
  });

  it('handles multiple dependencies', () => {
    const phases = createPhases({
      base1: [],
      base2: [],
      phase1: ['base1', 'base2'],
    });

    const result = resolveDependencyChain(phases, 'phase1');

    // Both bases should come before phase1
    expect(result).toContain('base1');
    expect(result).toContain('base2');
    expect(result).toContain('phase1');
    expect(result.indexOf('phase1')).toBeGreaterThan(result.indexOf('base1'));
    expect(result.indexOf('phase1')).toBeGreaterThan(result.indexOf('base2'));
  });

  it('throws error for unknown phase', () => {
    const phases = createPhases({
      phase0: [],
    });

    expect(() => resolveDependencyChain(phases, 'unknown')).toThrow(
      'Unknown phase: unknown'
    );
  });

  it('throws error for unknown dependency', () => {
    const phases = createPhases({
      phase1: ['nonexistent'],
    });

    expect(() => resolveDependencyChain(phases, 'phase1')).toThrow(
      'Unknown phase: nonexistent'
    );
  });

  it('throws error for circular dependency', () => {
    const phases = createPhases({
      phaseA: ['phaseB'],
      phaseB: ['phaseA'],
    });

    expect(() => resolveDependencyChain(phases, 'phaseA')).toThrow(
      /Circular dependency detected/
    );
  });

  it('throws error for self-referencing dependency', () => {
    const phases = createPhases({
      phaseA: ['phaseA'],
    });

    expect(() => resolveDependencyChain(phases, 'phaseA')).toThrow(
      /Circular dependency detected/
    );
  });

  it('handles complex diamond dependency', () => {
    // Diamond: D depends on B and C, both depend on A
    const phases = createPhases({
      A: [],
      B: ['A'],
      C: ['A'],
      D: ['B', 'C'],
    });

    const result = resolveDependencyChain(phases, 'D');

    // A must come before B and C, B and C must come before D
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'));
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('C'));
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('D'));
    expect(result.indexOf('C')).toBeLessThan(result.indexOf('D'));
    // A should only appear once
    expect(result.filter((p) => p === 'A')).toHaveLength(1);
  });
});

describe('buildTestPlan', () => {
  function createConfig(
    phaseDefs: Record<string, { deps: string[]; tests: string[] }>
  ): PhaseGatesConfig {
    const phases: Record<string, Phase> = {};
    for (const [id, { deps, tests }] of Object.entries(phaseDefs)) {
      phases[id] = {
        description: `Test phase ${id}`,
        depends_on: deps,
        required_tests: tests.map((t) => ({
          id: t,
          command: `echo ${t}`,
          asserts: [],
        })),
        blocks_next_phase_on_failure: true,
      };
    }
    return {
      version: '1.0',
      current_phase_file: '.regintel/current_phase.txt',
      phases,
      rules: [],
    };
  }

  it('returns tests for single phase', () => {
    const config = createConfig({
      phase0: { deps: [], tests: ['test1', 'test2'] },
    });

    const plan = buildTestPlan(config, 'phase0');

    expect(plan).toHaveLength(2);
    expect(plan[0]).toEqual({
      phaseId: 'phase0',
      test: { id: 'test1', command: 'echo test1', asserts: [] },
    });
    expect(plan[1]).toEqual({
      phaseId: 'phase0',
      test: { id: 'test2', command: 'echo test2', asserts: [] },
    });
  });

  it('includes dependency tests first', () => {
    const config = createConfig({
      phase0: { deps: [], tests: ['base_test'] },
      phase1: { deps: ['phase0'], tests: ['phase1_test'] },
    });

    const plan = buildTestPlan(config, 'phase1');

    expect(plan).toHaveLength(2);
    expect(plan[0].phaseId).toBe('phase0');
    expect(plan[0].test.id).toBe('base_test');
    expect(plan[1].phaseId).toBe('phase1');
    expect(plan[1].test.id).toBe('phase1_test');
  });

  it('preserves test order within phase', () => {
    const config = createConfig({
      phase0: { deps: [], tests: ['first', 'second', 'third'] },
    });

    const plan = buildTestPlan(config, 'phase0');

    expect(plan.map((p) => p.test.id)).toEqual(['first', 'second', 'third']);
  });

  it('handles phase with no tests', () => {
    const config = createConfig({
      phase0: { deps: [], tests: [] },
    });

    const plan = buildTestPlan(config, 'phase0');

    expect(plan).toHaveLength(0);
  });

  it('handles deep dependency chain with multiple tests', () => {
    const config = createConfig({
      phase0: { deps: [], tests: ['p0_t1', 'p0_t2'] },
      phase1: { deps: ['phase0'], tests: ['p1_t1'] },
      phase2: { deps: ['phase1'], tests: ['p2_t1', 'p2_t2'] },
    });

    const plan = buildTestPlan(config, 'phase2');

    expect(plan).toHaveLength(5);
    expect(plan.map((p) => p.test.id)).toEqual([
      'p0_t1',
      'p0_t2',
      'p1_t1',
      'p2_t1',
      'p2_t2',
    ]);
  });
});

describe('findUnexpectedSrcFiles', () => {
  it('returns empty when src is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-src-missing-'));
    try {
      expect(findUnexpectedSrcFiles(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects files under src and ignores src-legacy', () => {
    const root = mkdtempSync(join(tmpdir(), 'gate-src-present-'));
    try {
      const srcPath = join(root, 'src');
      const legacyPath = join(root, 'src-legacy');
      mkdirSync(srcPath, { recursive: true });
      mkdirSync(legacyPath, { recursive: true });
      writeFileSync(join(srcPath, 'leftover.ts'), 'export {};');
      writeFileSync(join(legacyPath, 'ok.ts'), 'export {};');

      const unexpected = findUnexpectedSrcFiles(root);
      expect(unexpected).toHaveLength(1);
      expect(unexpected[0]).toContain('leftover.ts');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
