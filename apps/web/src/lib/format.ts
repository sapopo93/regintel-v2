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

const TOPIC_WORD_OVERRIDES: Record<string, string> = {
  and: 'and', of: 'of', the: 'the', in: 'in', for: 'for', to: 'to', with: 'with',
  cqc: 'CQC', dols: 'DoLS', mca: 'MCA', riddor: 'RIDDOR', saf: 'SAF',
};

/**
 * Converts a topic slug to display title
 * e.g. "learning-culture" → "Learning Culture"
 */
export function formatTopicId(slug: string): string {
  return slug
    .split('-')
    .map((word, i) => {
      const lower = word.toLowerCase();
      const override = TOPIC_WORD_OVERRIDES[lower];
      if (override) return i === 0 ? override.charAt(0).toUpperCase() + override.slice(1) : override;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'Word Document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'application/vnd.ms-excel': 'Excel Spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  'text/csv': 'CSV',
  'text/plain': 'Plain Text',
  'text/html': 'HTML',
  'image/png': 'PNG Image',
  'image/jpeg': 'JPEG Image',
  'image/jpg': 'JPEG Image',
  'application/octet-stream': 'Binary File',
};

/**
 * Converts a MIME type to a human-readable label
 */
export function formatMimeType(mimeType: string): string {
  return MIME_LABELS[mimeType] ?? mimeType.split('/').pop()?.toUpperCase() ?? mimeType;
}

const FILENAME_TYPE_PATTERNS: [RegExp, string][] = [
  [/\bmar\b/i, 'MAR_CHART'],
  [/\bcare[_\s-]?plan/i, 'CARE_PLAN'],
  [/\brisk[_\s-]?assess/i, 'RISK_ASSESSMENT'],
  [/\bincident/i, 'INCIDENT_REPORT'],
  [/\bfire[_\s-]?safety/i, 'FIRE_SAFETY_CHECK'],
  [/\binfection[_\s-]?control/i, 'INFECTION_CONTROL_AUDIT'],
  [/\btraining/i, 'TRAINING'],
  [/\brota\b/i, 'ROTA'],
  [/\bsupervision/i, 'SUPERVISION'],
  [/\bdbs\b|recruitment/i, 'RECRUITMENT_FILE'],
  [/\bsafeguarding/i, 'SAFEGUARDING_RECORD'],
  [/\bcomplaint/i, 'COMPLAINTS_LOG'],
  [/\bdols\b|\bmca\b|mental[_\s-]?capacity/i, 'DOLS_MCA_ASSESSMENT'],
  [/\bvisit[_\s-]?log/i, 'VISIT_LOG'],
  [/\bmissed[_\s-]?visit/i, 'MISSED_VISIT_RECORD'],
  [/\bwound/i, 'WOUND_CARE_RECORD'],
  [/\bbody[_\s-]?map/i, 'BODY_MAP'],
  [/\bfluid|food[_\s-]?chart/i, 'FLUID_FOOD_CHART'],
  [/\bnutrition/i, 'NUTRITIONAL_ASSESSMENT'],
  [/\bmedication[_\s-]?proto/i, 'MEDICATION_PROTOCOL'],
  [/\bpolicy\b/i, 'POLICY'],
  [/\baudit\b/i, 'AUDIT'],
  [/\bcertificate/i, 'CERTIFICATE'],
  [/\bhandover/i, 'HANDOVER_NOTES'],
  [/\bdaily[_\s-]?notes/i, 'DAILY_NOTES'],
  [/\bmeeting[_\s-]?minutes/i, 'STAFF_MEETING_MINUTES'],
  [/\bequipment[_\s-]?maint/i, 'EQUIPMENT_MAINTENANCE_LOG'],
  [/\bactivity/i, 'ACTIVITY_PROGRAMME'],
  [/\bsurvey/i, 'RESIDENT_SURVEY'],
];

/**
 * Suggests an evidence type from a filename.
 * Returns the suggested type or null if no match.
 */
export function suggestEvidenceType(fileName: string): string | null {
  for (const [pattern, type] of FILENAME_TYPE_PATTERNS) {
    if (pattern.test(fileName)) return type;
  }
  return null;
}
