/**
 * Secrets Scanning Module
 *
 * Phase 0 Foundation: No secrets in repository.
 * Scans files for common secret patterns to prevent accidental commits.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

export interface SecretMatch {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

export interface ScanResult {
  scannedFiles: number;
  matches: SecretMatch[];
  clean: boolean;
}

/**
 * Common secret patterns to detect.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS Access Key ID',
  },
  {
    name: 'AWS Secret Key',
    pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    description: 'Potential AWS Secret Access Key (40 char base64)',
  },
  {
    name: 'Generic API Key',
    pattern: /['"]?(?:api[_-]?key|apikey)['"]?\s*[:=]\s*['"]([^'"]{20,})['"]?/gi,
    description: 'Generic API key assignment',
  },
  {
    name: 'Generic Secret',
    pattern: /['"]?(?:secret|password|passwd|pwd)['"]?\s*[:=]\s*['"]([^'"]{8,})['"]?/gi,
    description: 'Generic secret/password assignment',
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    description: 'Private key header',
  },
  {
    name: 'GitHub Token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    description: 'GitHub personal access token',
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    description: 'Slack API token',
  },
  {
    name: 'JWT',
    pattern: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*/g,
    description: 'JSON Web Token',
  },
  {
    name: 'Database URL',
    pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^\s'"]+/gi,
    description: 'Database connection string with credentials',
  },
];

/**
 * Files and directories to ignore during scanning.
 */
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '*.lock',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '.env.example',
  '.env.template',
  '*.test.ts',
  '*.spec.ts',
  '*.tsbuildinfo', // TypeScript incremental build cache
  'secrets-scan.ts', // Ignore this file (contains patterns)
  '.DS_Store', // Mac system metadata files
  'test-helpers.ts', // Test utilities with localhost test credentials
  'docs', // Documentation with example/placeholder credentials
  'scripts', // Operational scripts (may contain example URLs/patterns)
  '.github', // CI configuration with test environment setup
];

/**
 * Checks if a path should be ignored.
 */
function shouldIgnore(filePath: string): boolean {
  const relativePath = filePath.replace(/\\/g, '/');

  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.startsWith('*')) {
      const ext = pattern.slice(1);
      if (relativePath.endsWith(ext)) {
        return true;
      }
    } else if (relativePath.includes(`/${pattern}/`) || relativePath.includes(`/${pattern}`)) {
      return true;
    } else if (relativePath.endsWith(`/${pattern}`) || relativePath === pattern) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively collects all files in a directory.
 */
function collectFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = relative(baseDir, fullPath);

      if (shouldIgnore(relativePath)) {
        continue;
      }

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          files.push(...collectFiles(fullPath, baseDir));
        } else if (stat.isFile()) {
          files.push(fullPath);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Scans a single file for secrets.
 */
function scanFile(
  filePath: string,
  baseDir: string,
  patterns: SecretPattern[]
): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const relativePath = relative(baseDir, filePath);

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const secretPattern of patterns) {
        // Reset regex state
        secretPattern.pattern.lastIndex = 0;

        if (secretPattern.pattern.test(line)) {
          // Create a safe snippet (redact potential secrets)
          const snippet =
            line.length > 80 ? line.slice(0, 80) + '...' : line;

          matches.push({
            file: relativePath,
            line: lineNum + 1,
            pattern: secretPattern.name,
            snippet: snippet.trim(),
          });
        }
      }
    }
  } catch {
    // Skip files we can't read
  }

  return matches;
}

/**
 * Scans a directory for secrets.
 */
export function scanDirectory(
  dir: string,
  patterns: SecretPattern[] = SECRET_PATTERNS
): ScanResult {
  const files = collectFiles(dir, dir);
  const allMatches: SecretMatch[] = [];

  for (const file of files) {
    const fileMatches = scanFile(file, dir, patterns);
    allMatches.push(...fileMatches);
  }

  return {
    scannedFiles: files.length,
    matches: allMatches,
    clean: allMatches.length === 0,
  };
}

/**
 * Scans a single string for secrets (useful for testing).
 */
export function scanString(
  content: string,
  patterns: SecretPattern[] = SECRET_PATTERNS
): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    for (const secretPattern of patterns) {
      secretPattern.pattern.lastIndex = 0;

      if (secretPattern.pattern.test(line)) {
        matches.push({
          file: '<string>',
          line: lineNum + 1,
          pattern: secretPattern.name,
          snippet: line.length > 80 ? line.slice(0, 80) + '...' : line,
        });
      }
    }
  }

  return matches;
}
