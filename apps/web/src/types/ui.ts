/**
 * UI-specific types for RegIntel
 *
 * These are view models and UI-layer types.
 * Domain types are imported from backend.
 */

import type { ConstitutionalMetadata } from '../lib/api/types';

/**
 * Sidebar navigation item
 */
export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  count?: number;
}

/**
 * System status indicator
 */
export interface SystemStatus {
  label: string;
  version: string;
  hash: string;
  verified: boolean;
}

/**
 * Disclosure panel state
 */
export interface DisclosurePanelState {
  currentLayer: 'summary' | 'evidence' | 'trace';
}

/**
 * Base props for constitutional components
 */
export interface ConstitutionalComponentProps extends ConstitutionalMetadata {
  children?: React.ReactNode;
}

/**
 * Badge variant types
 */
export type BadgeVariant = 'simulation' | 'official' | 'self' | 'neutral';

/**
 * Evidence status colors (not traffic lights)
 */
export type EvidenceStatusColor = 'active' | 'expired' | 'missing';
