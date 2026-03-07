/**
 * UI Constants for RegIntel v2
 *
 * These constants are strictly controlled and must match backend definitions
 * where applicable. Changes require coordination with domain layer.
 */

// UI display watermark (plain English for providers)
// Note: backend EXPORT_WATERMARK in packages/domain stays unchanged (tested by phase gates)
export const SIMULATION_WATERMARK = 'PRACTICE INSPECTION — NOT AN OFFICIAL CQC RECORD';

// Origin types from domain layer
export const ORIGIN_TYPES = {
  SYSTEM_MOCK: 'SYSTEM_MOCK',
  ACTUAL_INSPECTION: 'ACTUAL_INSPECTION',
  SELF_IDENTIFIED: 'SELF_IDENTIFIED',
} as const;

// Origin badge labels for display
export const ORIGIN_LABELS = {
  SYSTEM_MOCK: 'Practice',
  ACTUAL_INSPECTION: 'CQC',
  SELF_IDENTIFIED: 'SELF',
} as const;

// Reporting domains
export const REPORTING_DOMAINS = {
  MOCK_SIMULATION: 'MOCK_SIMULATION',
  REGULATORY_HISTORY: 'REGULATORY_HISTORY',
} as const;

// Disclosure layers - strict ordering
export const DISCLOSURE_LAYERS = ['summary', 'evidence', 'trace'] as const;
export type DisclosureLayer = (typeof DISCLOSURE_LAYERS)[number];

// Layer actions - what each layer can navigate to
export const LAYER_ACTIONS = {
  summary: ['showEvidence'],
  evidence: ['showTrace'],
  trace: [], // Terminal layer
} as const;

// Domain types
export const DOMAINS = {
  CQC: 'CQC',
  IMMIGRATION: 'IMMIGRATION',
} as const;

// Sidebar navigation items
export const SIDEBAR_NAVIGATION = [
  { id: 'providers', label: 'Providers', href: '/providers' },
  { id: 'overview', label: 'Overview', href: '/overview' },
  { id: 'topics', label: 'Inspection Areas', href: '/topics' },
  { id: 'mock-session', label: 'Practice Inspection', href: '/mock-session' },
  { id: 'findings', label: 'Findings', href: '/findings' },
  { id: 'facilities', label: 'Locations', href: '/facilities' },
  { id: 'evidence', label: 'Evidence', href: '/evidence' },
  { id: 'exports', label: 'Exports', href: '/exports' },
  { id: 'audit', label: 'Audit Trail', href: '/audit' },
] as const;

// Severity levels (display only - no computation in UI)
export const SEVERITY_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

// Evidence status types
export const EVIDENCE_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  MISSING: 'MISSING',
} as const;
export type EvidenceStatus = keyof typeof EVIDENCE_STATUS;
