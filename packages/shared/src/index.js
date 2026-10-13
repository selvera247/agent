/** Shared contracts for the FinDataGraph financial data graph API + web */

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
  // Card auth ↔ settlement ↔ cash received
  AUTH_NOT_SETTLED: "auth_not_settled",
  SETTLED_NOT_RECEIVED: "settled_not_received",
  RECEIVED_UNMATCHED: "received_unmatched",
  FEE_VARIANCE: "fee_variance",
  AUTH_SETTLE_AMOUNT_MISMATCH: "auth_settle_amount_mismatch",
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
  SPEC_GENERATED: "spec_generated",
  SPEC_IMPLEMENTED: "spec_implemented",
  REPORT_GENERATED: "report_generated",
  CONNECTOR_SYNCED: "connector_synced",
  CLUSTER_STARTED: "cluster_started",
  CLUSTER_COMPLETED: "cluster_completed",
  EVIDENCE_RECORDED: "evidence_recorded",
});

export const MATCH_KINDS = Object.freeze({
  CRM_GL: "crm_gl",
  CC_AUTH_SETTLE_CASH: "cc_auth_settle_cash",
});

/** Materiality threshold in USD — dual control recommended above this */
export const MATERIALITY_USD = 10000;

/** Demo credit costs per metered action */
export const ACTION_CREDITS = Object.freeze({
  "recon.run": 10,
  "exception.resolve": 3,
  "correction.approve": 5,
  "specs.generate": 2,
  "specs.implement": 8,
  "report.generate": 4,
  "connector.sync": 2,
  "cluster.run": 15,
});

/** Week-1 Jumpstart agent ids published under registry/agents */
export const JUMPSTART_AGENTS = Object.freeze({
  CRM_GL: "peak.close.crm-gl-revenue",
  COLLECTIONS: "peak.collections.recommendation",
});

/** Ordered cluster workflow steps (detect → … → report) */
export const CLUSTER_STEPS = Object.freeze([
  "detect",
  "investigate",
  "resolve",
  "report",
]);
