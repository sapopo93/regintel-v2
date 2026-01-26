/**
 * Formatting utilities for RegIntel UI
 *
 * Pure functions for display formatting.
 * NO business logic - only string transformations.
 */

/**
 * Truncates a hash for display with ellipsis
 * Shows first 8 and last 4 characters by default
 */
export function truncateHash(
  hash: string,
  options?: { prefix?: number; suffix?: number }
): string {
  const prefix = options?.prefix ?? 8;
  const suffix = options?.suffix ?? 4;

  if (hash.length <= prefix + suffix + 3) {
    return hash;
  }

  return `${hash.slice(0, prefix)}...${hash.slice(-suffix)}`;
}

/**
 * Formats a timestamp for display
 * Uses ISO 8601 format for unambiguous representation
 */
export function formatTimestamp(
  timestamp: string | Date,
  options?: { dateOnly?: boolean }
): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

  if (options?.dateOnly) {
    return date.toISOString().split('T')[0];
  }

  return date.toISOString();
}

/**
 * Formats a date for human-readable display
 * Used in sidebar and headers
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * Formats a count ratio (e.g., "2 / 5")
 */
export function formatCountRatio(completed: number, total: number): string {
  return `${completed} / ${total}`;
}

/**
 * Formats a percentage for display
 * Appends % symbol
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Formats a version string with hash
 * E.g., "v1 (abc123...)"
 */
export function formatVersionWithHash(
  version: string,
  hash: string
): string {
  return `${version} (${truncateHash(hash)})`;
}

/**
 * Formats follow-up counter display
 * E.g., "Follow-ups used: 2 / 4"
 */
export function formatFollowUpCounter(used: number, limit: number): string {
  return `Follow-ups used: ${used} / ${limit}`;
}

/**
 * Ensures hash has proper prefix for display
 */
export function formatHashWithPrefix(hash: string): string {
  if (hash.startsWith('sha256:')) {
    return hash;
  }
  return `sha256:${hash}`;
}
