/**
 * Input Sanitizer
 *
 * Prevents prompt injection and other input-based attacks.
 * All user input must pass through sanitization before being included in prompts.
 */

/**
 * Sanitization result
 */
export interface SanitizationResult {
  /** Sanitized text */
  text: string;

  /** Whether any changes were made */
  modified: boolean;

  /** Warnings about suspicious content */
  warnings: string[];
}

/**
 * Patterns that indicate potential prompt injection
 */
const INJECTION_PATTERNS = [
  // Direct instruction overrides
  /ignore (?:all )?(?:previous|prior|above) (?:instructions?|prompts?)/i,
  /forget (?:all )?(?:previous|prior|your) (?:instructions?|context)/i,
  /disregard (?:all )?(?:previous|prior) (?:instructions?|rules?)/i,
  /new (?:instructions?|task|objective):?/i,
  /system prompt:?/i,
  /you are now/i,
  /pretend (?:you are|to be)/i,
  /act as (?:if|though)/i,

  // Role manipulation
  /you must now/i,
  /your new (?:role|task|objective)/i,
  /switch to (?:mode|role)/i,
  /enter (?:\w+ )?mode/i,

  // Output manipulation
  /output (?:the|your) (?:system|original) prompt/i,
  /reveal (?:the|your) (?:system|original) (?:prompt|instructions?)/i,
  /show (?:me )?(?:the|your) (?:system|original) (?:prompt|instructions?)/i,
  /what (?:are|were) (?:your|the) (?:original )?instructions?/i,

  // Delimiter attacks
  /```system/i,
  /<\|system\|>/i,
  /<\|user\|>/i,
  /<\|assistant\|>/i,
  /\[SYSTEM\]/i,
  /\[USER\]/i,
  /\[ASSISTANT\]/i,

  // Jailbreak attempts
  /jailbreak/i,
  /bypass (?:safety|filter|restriction)/i,
  /unlock (?:hidden|secret) (?:mode|features?)/i,
];

/**
 * Characters to escape in prompts
 */
const ESCAPE_CHARS: Record<string, string> = {
  '`': "'",
  '<': '‹',
  '>': '›',
  '|': '│',
  '[': '「',
  ']': '」',
};

/**
 * Maximum safe input length
 */
const MAX_INPUT_LENGTH = 50000;

/**
 * Sanitize text for use in prompts
 */
export function sanitizeInput(
  input: string,
  options: {
    /** Maximum length (truncates if exceeded) */
    maxLength?: number;
    /** Escape special characters */
    escapeSpecialChars?: boolean;
    /** Block injection attempts */
    blockInjection?: boolean;
  } = {}
): SanitizationResult {
  const {
    maxLength = MAX_INPUT_LENGTH,
    escapeSpecialChars = true,
    blockInjection = true,
  } = options;

  const warnings: string[] = [];
  let text = input;
  let modified = false;

  // Check for empty input
  if (!text || typeof text !== 'string') {
    return { text: '', modified: false, warnings: [] };
  }

  // Truncate if too long
  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
    modified = true;
    warnings.push(`Input truncated from ${input.length} to ${maxLength} characters`);
  }

  // Check for injection patterns
  if (blockInjection) {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        warnings.push(`Potential injection pattern detected: ${pattern.source}`);
        // Replace matched content with placeholder
        text = text.replace(pattern, '[REDACTED]');
        modified = true;
      }
    }
  }

  const redactionToken = '[REDACTED]';
  const redactionPlaceholder = '__REDACTED__';
  if (text.includes(redactionToken)) {
    text = text.split(redactionToken).join(redactionPlaceholder);
  }

  // Escape special characters
  if (escapeSpecialChars) {
    for (const [char, replacement] of Object.entries(ESCAPE_CHARS)) {
      if (text.includes(char)) {
        text = text.split(char).join(replacement);
        modified = true;
      }
    }
  }

  // Remove null bytes and other control characters
  const originalLength = text.length;
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  if (text.length !== originalLength) {
    modified = true;
    warnings.push('Removed control characters');
  }

  // Normalize unicode
  text = text.normalize('NFC');

  if (text.includes(redactionPlaceholder)) {
    text = text.split(redactionPlaceholder).join(redactionToken);
  }

  return { text, modified, warnings };
}

/**
 * Sanitize file name for use in prompts
 */
export function sanitizeFileName(fileName: string): string {
  // Remove path components
  let name = fileName.split(/[/\\]/).pop() || '';

  // Remove potentially dangerous characters
  name = name.replace(/[<>:"|?*\x00-\x1F]/g, '');

  // Limit length
  if (name.length > 255) {
    const ext = name.split('.').pop() || '';
    const base = name.slice(0, 255 - ext.length - 1);
    name = `${base}.${ext}`;
  }

  return name;
}

/**
 * Sanitize extracted text content
 */
export function sanitizeExtractedText(text: string): string {
  const result = sanitizeInput(text, {
    maxLength: 100000, // Allow longer extracted content
    escapeSpecialChars: false, // Don't escape in extracted content
    blockInjection: true, // Still block injection
  });

  return result.text;
}

/**
 * Create a safe prompt context from user data
 */
export function createSafeContext(data: Record<string, unknown>): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      safe[key] = sanitizeInput(value, { maxLength: 5000 }).text;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = String(value);
    } else if (value === null || value === undefined) {
      safe[key] = '';
    } else if (Array.isArray(value)) {
      safe[key] = value.map((v) => (typeof v === 'string' ? sanitizeInput(v, { maxLength: 1000 }).text : String(v))).join(', ');
    }
    // Skip other types (objects, functions, etc.)
  }

  return safe;
}
