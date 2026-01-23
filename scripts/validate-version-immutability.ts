#!/usr/bin/env node
/**
 * Version Immutability Validator
 *
 * Enforces "amend-by-version" rule: versioned artifacts are immutable.
 * Once a version is published (e.g., v1), it cannot be modified.
 * To make changes, create a new version (e.g., v2).
 *
 * Usage:
 *   tsx scripts/validate-version-immutability.ts [base-ref]
 *
 * Examples:
 *   tsx scripts/validate-version-immutability.ts main
 *   tsx scripts/validate-version-immutability.ts HEAD~1
 *
 * Exit codes:
 *   0 - No immutability violations
 *   1 - Immutability violations detected
 *   2 - Validation error (git not available, etc.)
 */

import { execSync } from 'node:child_process';

interface ValidationResult {
  valid: boolean;
  violations: VersionViolation[];
}

interface VersionViolation {
  filePath: string;
  version: string;
  reason: string;
}

/**
 * Pattern for versioned JSON files.
 * Matches: *.v1.json, *.v2.json, topic-catalog.v1.json, etc.
 */
const VERSIONED_FILE_PATTERN = /\.v(\d+)\.json$/;

/**
 * Extracts version number from a file path.
 * Returns null if file doesn't match version pattern.
 */
function extractVersion(filePath: string): string | null {
  const match = filePath.match(VERSIONED_FILE_PATTERN);
  return match ? `v${match[1]}` : null;
}

/**
 * Gets list of modified files between base ref and HEAD.
 * Returns empty array if git is not available or not in a git repo.
 */
function getModifiedFiles(baseRef: string): string[] {
  try {
    // Check if we're in a git repository
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });

    // Get list of modified files (added, modified, renamed)
    // We use --diff-filter=AMR to include Added, Modified, and Renamed files
    const output = execSync(`git diff --name-only --diff-filter=AMR ${baseRef}...HEAD`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
  } catch (error) {
    // Not a git repo or git not available
    console.warn('Warning: Could not get git diff. Skipping validation.');
    return [];
  }
}

/**
 * Checks if a file existed in the base ref.
 * Returns true if the file existed, false if it's a new file.
 */
function fileExistedInBase(filePath: string, baseRef: string): boolean {
  try {
    execSync(`git cat-file -e ${baseRef}:${filePath}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates version immutability rules.
 */
function validateVersionImmutability(baseRef: string = 'main'): ValidationResult {
  const violations: VersionViolation[] = [];
  const modifiedFiles = getModifiedFiles(baseRef);

  console.log(`Checking ${modifiedFiles.length} modified files for version immutability violations...`);

  for (const filePath of modifiedFiles) {
    const version = extractVersion(filePath);

    // Only check versioned JSON files
    if (!version) {
      continue;
    }

    // Check if this is a modification to an existing versioned file
    const existedInBase = fileExistedInBase(filePath, baseRef);

    if (existedInBase) {
      // This is a modification to an existing versioned file - VIOLATION
      violations.push({
        filePath,
        version,
        reason: `Versioned file ${version} cannot be modified. Create a new version instead (e.g., ${filePath.replace(/\.v\d+\.json$/, `.v${parseInt(version.slice(1)) + 1}.json`)})`,
      });
    } else {
      // This is a new versioned file - ALLOWED
      console.log(`  ✓ New version file: ${filePath} (${version})`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Prints validation results.
 */
function printResults(result: ValidationResult): void {
  if (result.valid) {
    console.log('\n✅ Version immutability validation passed!');
    console.log('   No modifications to frozen version files detected.');
    return;
  }

  console.error('\n❌ Version immutability validation FAILED!');
  console.error('   The following versioned files have been modified:\n');

  for (const violation of result.violations) {
    console.error(`   • ${violation.filePath} (${violation.version})`);
    console.error(`     ${violation.reason}\n`);
  }

  console.error('   Rule: Versioned artifacts are immutable.');
  console.error('   To make changes, create a new version instead of modifying existing versions.');
  console.error('\n   Examples:');
  console.error('     ✗ Modifying topic-catalog.v1.json');
  console.error('     ✓ Creating topic-catalog.v2.json\n');
}

/**
 * Main entry point.
 */
function main(): void {
  const baseRef = process.argv[2] || 'origin/main';

  console.log('Version Immutability Validator');
  console.log('================================');
  console.log(`Base ref: ${baseRef}\n`);

  try {
    const result = validateVersionImmutability(baseRef);
    printResults(result);

    if (!result.valid) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Validation error:', error);
    process.exit(2);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for testing
export { validateVersionImmutability, extractVersion, type ValidationResult, type VersionViolation };
