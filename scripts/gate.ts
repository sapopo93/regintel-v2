#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// Types
export interface PhaseTest {
  id: string;
  command: string;
  asserts: string[];
}

export interface Phase {
  description: string;
  depends_on: string[];
  required_tests: PhaseTest[];
  blocks_next_phase_on_failure: boolean;
}

export interface PhaseGatesConfig {
  version: string;
  current_phase_file: string;
  phases: Record<string, Phase>;
  rules: string[];
}

export type TestStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface TestResult {
  phaseId: string;
  testId: string;
  status: TestStatus;
  durationMs: number;
  error?: string;
  skipReason?: string;
}

export interface GateRunnerOptions {
  configPath?: string;
  projectRoot?: string;
  strict?: boolean;
  dryRun?: boolean;
}

// Get project root (where package.json lives)
function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, '..');
}

/**
 * Finds unexpected files under /src (excluding /src-legacy).
 * Used as a structural guard to prevent drift from /packages layout.
 */
export function findUnexpectedSrcFiles(projectRoot: string): string[] {
  const srcRoot = resolve(projectRoot, 'src');
  if (!existsSync(srcRoot)) {
    return [];
  }

  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'src-legacy') {
        continue;
      }
      const fullPath = resolve(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        results.push(fullPath);
      }
    }
  }

  walk(srcRoot);
  return results;
}

/**
 * Reads the current phase from the phase file.
 */
export function readCurrentPhase(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`Phase file not found: ${path}`);
  }
  const content = readFileSync(path, 'utf-8').trim();
  if (!content) {
    throw new Error(`Phase file is empty: ${path}`);
  }
  return content;
}

/**
 * Loads and parses the phase gates YAML configuration.
 */
export function loadPhaseGates(path: string): PhaseGatesConfig {
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }
  const content = readFileSync(path, 'utf-8');
  const config = parseYaml(content) as PhaseGatesConfig;

  // Validate structure
  if (!config.phases || typeof config.phases !== 'object') {
    throw new Error('Invalid config: missing phases');
  }

  // Ensure all phases have depends_on array
  for (const [phaseId, phase] of Object.entries(config.phases)) {
    if (!phase.depends_on) {
      phase.depends_on = [];
    }
    if (!phase.required_tests) {
      phase.required_tests = [];
    }
  }

  return config;
}

/**
 * Resolves the dependency chain for a target phase using topological sort.
 * Returns phases in order they should be executed (dependencies first).
 * Throws if circular dependency detected or unknown phase referenced.
 */
export function resolveDependencyChain(
  phases: Record<string, Phase>,
  target: string
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(phaseId: string): void {
    if (visiting.has(phaseId)) {
      throw new Error(`Circular dependency detected: ${phaseId}`);
    }
    if (visited.has(phaseId)) {
      return;
    }
    if (!phases[phaseId]) {
      throw new Error(`Unknown phase: ${phaseId}`);
    }

    visiting.add(phaseId);

    for (const dep of phases[phaseId].depends_on) {
      visit(dep);
    }

    visiting.delete(phaseId);
    visited.add(phaseId);
    result.push(phaseId);
  }

  visit(target);
  return result;
}

/**
 * Builds an ordered test plan for a phase and its dependencies.
 * Returns tests in order: dependency tests first, then target phase tests.
 */
export function buildTestPlan(
  config: PhaseGatesConfig,
  targetPhase: string
): Array<{ phaseId: string; test: PhaseTest }> {
  const phaseOrder = resolveDependencyChain(config.phases, targetPhase);
  const plan: Array<{ phaseId: string; test: PhaseTest }> = [];

  for (const phaseId of phaseOrder) {
    const phase = config.phases[phaseId];
    for (const test of phase.required_tests) {
      plan.push({ phaseId, test });
    }
  }

  return plan;
}

/**
 * Executes a single test command.
 * Returns PASS (exit 0), FAIL (non-zero exit), or SKIP (command not found).
 */
export async function executeTest(
  phaseId: string,
  test: PhaseTest,
  options: { projectRoot: string; dryRun?: boolean }
): Promise<TestResult> {
  const startTime = Date.now();

  if (options.dryRun) {
    return {
      phaseId,
      testId: test.id,
      status: 'SKIP',
      durationMs: 0,
      skipReason: 'dry run',
    };
  }

  return new Promise((resolvePromise) => {
    const child = spawn(test.command, {
      shell: true,
      cwd: options.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;

      // Check if command not found
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        resolvePromise({
          phaseId,
          testId: test.id,
          status: 'SKIP',
          durationMs,
          skipReason: 'not implemented yet',
        });
      } else {
        resolvePromise({
          phaseId,
          testId: test.id,
          status: 'FAIL',
          durationMs,
          error: err.message,
        });
      }
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;

      if (code === 0) {
        resolvePromise({
          phaseId,
          testId: test.id,
          status: 'PASS',
          durationMs,
        });
      } else {
        // Check if the error indicates "no tests found" or similar
        const combinedOutput = stdout + stderr;
        const noTestsPatterns = [
          /no test files found/i,
          /no tests found/i,
          /pattern .* did not match/i,
          /no test suites found/i,
        ];

        const isNoTests = noTestsPatterns.some((p) => p.test(combinedOutput));

        if (isNoTests) {
          resolvePromise({
            phaseId,
            testId: test.id,
            status: 'SKIP',
            durationMs,
            skipReason: 'not implemented yet',
          });
        } else {
          resolvePromise({
            phaseId,
            testId: test.id,
            status: 'FAIL',
            durationMs,
            error: stderr || stdout || `Exit code: ${code}`,
          });
        }
      }
    });
  });
}

/**
 * Determines if strict mode is enabled.
 * Strict mode is enabled if --strict flag is passed or CI=true.
 */
export function isStrictMode(args: string[] = process.argv): boolean {
  if (args.includes('--strict')) {
    return true;
  }
  return process.env.CI === 'true';
}

/**
 * Computes exit code based on results and strict mode.
 * In strict mode, SKIPs are treated as failures.
 */
export function computeExitCode(results: TestResult[], strict: boolean): number {
  const hasFailed = results.some((r) => r.status === 'FAIL');
  const hasSkipped = results.some((r) => r.status === 'SKIP');
  return hasFailed || (strict && hasSkipped) ? 1 : 0;
}

/**
 * Formats and prints the gate runner report.
 */
function printReport(results: TestResult[]): void {
  const separator = '='.repeat(60);
  const thinSeparator = '-'.repeat(60);

  console.log('');
  console.log(separator);
  console.log('GATE RUNNER REPORT');
  console.log(separator);
  console.log('');

  // Group results by phase
  const byPhase = new Map<string, TestResult[]>();
  for (const result of results) {
    if (!byPhase.has(result.phaseId)) {
      byPhase.set(result.phaseId, []);
    }
    byPhase.get(result.phaseId)!.push(result);
  }

  for (const [phaseId, phaseResults] of byPhase) {
    console.log(`${phaseId}:`);
    for (const result of phaseResults) {
      const statusIcon =
        result.status === 'PASS' ? '[OK]' :
        result.status === 'SKIP' ? '[--]' :
        '[XX]';

      const suffix = result.skipReason
        ? ` - SKIP: ${result.skipReason}`
        : '';

      console.log(`  ${statusIcon} ${result.testId} (${result.durationMs}ms)${suffix}`);

      if (result.error) {
        // Indent error message
        const errorLines = result.error.split('\n').slice(0, 5);
        for (const line of errorLines) {
          console.log(`      ${line}`);
        }
      }
    }
    console.log('');
  }

  // Summary
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  const total = results.length;

  console.log(thinSeparator);
  console.log(`Total: ${total} | Pass: ${passed} | Fail: ${failed} | Skip: ${skipped}`);
  console.log(separator);
}

function parseCliArgs(args: string[]): { strict: boolean } {
  const strict = isStrictMode(args);
  return { strict };
}

/**
 * Main entry point for the gate runner.
 * Executes tests with fail-fast behavior and prints report.
 */
export async function runGates(options: GateRunnerOptions = {}): Promise<number> {
  const projectRoot = options.projectRoot || getProjectRoot();
  const strict = options.strict ?? false;

  const unexpectedSrcFiles = findUnexpectedSrcFiles(projectRoot);
  if (unexpectedSrcFiles.length > 0) {
    console.error('Structure guard failed: /src is forbidden (use /packages or /src-legacy).');
    for (const filePath of unexpectedSrcFiles.slice(0, 10)) {
      console.error(`  - ${relative(projectRoot, filePath)}`);
    }
    if (unexpectedSrcFiles.length > 10) {
      console.error(`  ...and ${unexpectedSrcFiles.length - 10} more`);
    }
    return 1;
  }

  const configPath = options.configPath || resolve(projectRoot, 'docs/REGINTEL_PHASE_GATES.yml');

  // Load configuration
  let config: PhaseGatesConfig;
  try {
    config = loadPhaseGates(configPath);
  } catch (err) {
    console.error(`Configuration error: ${(err as Error).message}`);
    return 1;
  }

  // Read current phase
  const phaseFilePath = resolve(projectRoot, config.current_phase_file);
  let currentPhase: string;
  try {
    currentPhase = readCurrentPhase(phaseFilePath);
  } catch (err) {
    console.error(`Phase file error: ${(err as Error).message}`);
    return 1;
  }

  // Build test plan
  let testPlan: Array<{ phaseId: string; test: PhaseTest }>;
  try {
    testPlan = buildTestPlan(config, currentPhase);
  } catch (err) {
    console.error(`Test plan error: ${(err as Error).message}`);
    return 1;
  }

  if (testPlan.length === 0) {
    console.log('No tests to run for current phase.');
    return 0;
  }

  console.log(`Running gates for: ${currentPhase}`);
  console.log(`Tests to execute: ${testPlan.length}`);

  // Execute tests with fail-fast
  const results: TestResult[] = [];
  let hasFailed = false;

  for (const { phaseId, test } of testPlan) {
    const result = await executeTest(phaseId, test, {
      projectRoot,
      dryRun: options.dryRun,
    });
    results.push(result);

    if (result.status === 'FAIL') {
      hasFailed = true;
      break; // Fail-fast
    }
  }

  // Print report
  printReport(results);

  if (strict) {
    console.log('Strict mode: SKIPs treated as failures');
  }

  // Exit code: 0 if all PASS (or SKIP in non-strict), 1 if any FAIL (or SKIP in strict)
  return computeExitCode(results, strict);
}

// CLI entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const cliArgs = parseCliArgs(process.argv);
  runGates({ strict: cliArgs.strict }).then((code) => {
    process.exit(code);
  });
}
