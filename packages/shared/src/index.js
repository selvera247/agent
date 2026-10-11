/** Shared contracts for Peak Close API + web */

export const ROLES = Object.freeze({
  ADMIN: "admin",
  CONTROLLER: "controller",
  ACCOUNTANT: "accountant",
});

export const EXCEPTION_STATUS = Object.freeze({
  OPEN: "open",
  ASSIGNED: "assigned",
  PENDING_APPROVAL: "pending_approval",
  RESOLVED: "resolved",
  WAIVED: "waived",
});

export const EXCEPTION_TYPES = Object.freeze({
  AMOUNT_MISMATCH: "amount_mismatch",
  MISSING_IN_GL: "missing_in_gl",
  MISSING_IN_CRM: "missing_in_crm",
  ENTITY_MISMATCH: "entity_mismatch",
});

export const RUN_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
});

export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: "login",
  RUN_STARTED: "run_started",
  RUN_COMPLETED: "run_completed",
  EXCEPTION_ASSIGNED: "exception_assigned",
  EXCEPTION_RESOLVED: "exception_resolved",
  EXCEPTION_WAIVED: "exception_waived",
  CORRECTION_PROPOSED: "correction_proposed",
  CORRECTION_APPROVED: "correction_approved",
  CORRECTION_REJECTED: "correction_rejected",
});

/** Materiality threshold in USD — dual control recommended above this */
export const MATERIALITY_USD = 10000;
