/**
 * Action Entity (Phase 1: The Spine)
 *
 * Represents remediation actions with verification requirements.
 * Actions progress through a state machine: OPEN → IN_PROGRESS → PENDING_VERIFICATION → VERIFIED_CLOSED
 * IMMUTABLE: Action and ActionVerification records cannot be modified once created.
 */

import {
  ActionStatus,
  type TenantId,
  type ActionId,
  type FindingId,
  type EvidenceId,
  type ISOTimestamp,
  type Domain,
} from './types.js';

// Re-export ActionStatus for convenience
export { ActionStatus };

export interface Action {
  // Identity
  id: ActionId;
  tenantId: TenantId;
  domain: Domain;

  // Parent finding (REQUIRED - no orphan actions)
  findingId: FindingId;

  // Action details
  description: string;
  assignedTo?: string; // User ID of responsible person
  targetCompletionDate?: ISOTimestamp | null;

  // State machine
  status: ActionStatus;

  // Verification evidence
  verificationEvidenceIds: EvidenceId[]; // Evidence proving action is complete

  // Lifecycle
  createdAt: ISOTimestamp;
  createdBy: string;
  completedAt?: ISOTimestamp | null;
  verifiedAt?: ISOTimestamp | null;
}

/**
 * ActionVerification - Immutable verification record
 * Records who verified the action and when
 */
export interface ActionVerification {
  // Identity
  actionId: ActionId;
  tenantId: TenantId;

  // Verification details
  verifiedBy: string;
  verifiedAt: ISOTimestamp;
  verificationNotes?: string;

  // Outcome
  approved: boolean; // true = action closed, false = action rejected

  // If rejected
  rejectionReason?: string;
}

/**
 * Creates a new action.
 * Actions MUST reference a finding (no orphans).
 */
export function createAction(input: {
  id: ActionId;
  tenantId: TenantId;
  domain: Domain;
  findingId: FindingId;
  description: string;
  assignedTo?: string;
  targetCompletionDate?: ISOTimestamp | null;
  createdBy: string;
}): Action {
  if (!input.findingId) {
    throw new OrphanActionError('Action must reference a finding (findingId required)');
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    domain: input.domain,
    findingId: input.findingId,
    description: input.description,
    assignedTo: input.assignedTo,
    targetCompletionDate: input.targetCompletionDate ?? null,
    status: ActionStatus.OPEN,
    verificationEvidenceIds: [],
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    completedAt: null,
    verifiedAt: null,
  };
}

/**
 * Transitions an action to IN_PROGRESS.
 */
export function startAction(action: Action, startedBy: string): Action {
  if (action.status !== ActionStatus.OPEN) {
    throw new Error(`Action ${action.id} cannot be started (current status: ${action.status})`);
  }

  return {
    ...action,
    status: ActionStatus.IN_PROGRESS,
    assignedTo: action.assignedTo ?? startedBy, // Auto-assign if not already assigned
  };
}

/**
 * Adds verification evidence to an action and transitions to PENDING_VERIFICATION.
 */
export function submitForVerification(
  action: Action,
  evidenceIds: EvidenceId[]
): Action {
  if (action.status !== ActionStatus.IN_PROGRESS) {
    throw new Error(
      `Action ${action.id} cannot be submitted for verification (current status: ${action.status})`
    );
  }

  if (evidenceIds.length === 0) {
    throw new Error('At least one evidence item is required for verification');
  }

  return {
    ...action,
    status: ActionStatus.PENDING_VERIFICATION,
    verificationEvidenceIds: [...action.verificationEvidenceIds, ...evidenceIds],
  };
}

/**
 * Creates an action verification record and transitions action to VERIFIED_CLOSED or REJECTED.
 */
export function verifyAction(
  action: Action,
  verification: {
    verifiedBy: string;
    verificationNotes?: string;
    approved: boolean;
    rejectionReason?: string;
  }
): { action: Action; verification: ActionVerification } {
  if (action.status !== ActionStatus.PENDING_VERIFICATION) {
    throw new Error(
      `Action ${action.id} cannot be verified (current status: ${action.status})`
    );
  }

  if (!verification.approved && !verification.rejectionReason) {
    throw new Error('Rejection reason is required when rejecting an action');
  }

  const verificationRecord: ActionVerification = {
    actionId: action.id,
    tenantId: action.tenantId,
    verifiedBy: verification.verifiedBy,
    verifiedAt: new Date().toISOString(),
    verificationNotes: verification.verificationNotes,
    approved: verification.approved,
    rejectionReason: verification.rejectionReason,
  };

  const updatedAction: Action = {
    ...action,
    status: verification.approved ? ActionStatus.VERIFIED_CLOSED : ActionStatus.REJECTED,
    completedAt: verification.approved ? new Date().toISOString() : action.completedAt,
    verifiedAt: verification.approved ? new Date().toISOString() : action.verifiedAt,
  };

  return {
    action: updatedAction,
    verification: verificationRecord,
  };
}

/**
 * Reopens a rejected action (returns to OPEN).
 */
export function reopenAction(action: Action, reopenedBy: string): Action {
  if (action.status !== ActionStatus.REJECTED) {
    throw new Error(`Action ${action.id} can only be reopened if REJECTED (current status: ${action.status})`);
  }

  return {
    ...action,
    status: ActionStatus.OPEN,
    assignedTo: action.assignedTo ?? reopenedBy,
    // Keep verification evidence for audit trail
  };
}

/**
 * Error thrown when attempting to create an action without a finding.
 */
export class OrphanActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrphanActionError';
  }
}

/**
 * Validates action state machine invariants.
 */
export function validateActionState(action: Action): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if action is orphaned
  if (!action.findingId) {
    errors.push('Action must reference a finding');
  }

  // Check status transitions
  switch (action.status) {
    case ActionStatus.OPEN:
      // No invariants for OPEN
      break;

    case ActionStatus.IN_PROGRESS:
      if (!action.assignedTo) {
        errors.push('IN_PROGRESS actions must have an assignedTo user');
      }
      break;

    case ActionStatus.PENDING_VERIFICATION:
      if (action.verificationEvidenceIds.length === 0) {
        errors.push('PENDING_VERIFICATION actions must have verification evidence');
      }
      break;

    case ActionStatus.VERIFIED_CLOSED:
      if (!action.verifiedAt) {
        errors.push('VERIFIED_CLOSED actions must have verifiedAt');
      }
      break;

    case ActionStatus.REJECTED:
      // Rejected actions keep their state for audit
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
