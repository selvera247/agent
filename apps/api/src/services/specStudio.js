import { ACTION_CREDITS, AUDIT_ACTIONS, MATCH_KINDS } from "@findatagraph/shared";
import { getDb } from "../db/connection.js";
import { id } from "../lib/ids.js";
import { writeAudit } from "../lib/audit.js";
import { recordUsage } from "../lib/usage.js";

/** Dual-path starting points: seeded packs + NL templates */
export const STARTING_POINTS = [
  {
    id: "crm_to_accounting_revenue",
    label: "CRM ↔ GL revenue (seeded)",
    hint: "Meridian Retail — Salesforce invoices vs NetSuite GL",
    path: "seeded",
    template_id: "crm_gl_revenue",
    example_need:
      "continuous CRM-to-accounting revenue reconciliation with SOX lineage",
  },
  {
    id: "cc_auth_settle_received",
    label: "CC auth ↔ settlements ↔ received",
    hint: "Three-way card recon — generate a new agent pack",
    path: "generate",
    template_id: "cc_auth_settle_cash",
    example_need:
      "reconcile CC auth, settlements, and what we received",
  },
  {
    id: "intercompany",
    label: "Intercompany balances",
    hint: "Template preview (partial implement in demo)",
    path: "generate",
    template_id: "intercompany",
    example_need: "intercompany balance reconciliation across US-EAST and EU-CORE",
  },
];

const TEMPLATES = {
  crm_gl_revenue: {
    template_id: "crm_gl_revenue",
    title: "CRM invoices ↔ GL revenue",
    match_kind: MATCH_KINDS.CRM_GL,
    reusable_seed_code: "CRM_GL_REV",
    workflow: ["detect", "investigate", "resolve", "report"],
    ontology_extensions: [
      "Invoice",
      "GlRevenueLine",
      "Entity",
      "Exception",
      "Correction",
      "Evidence",
    ],
    evidence_requirements: [
      {
        action: "recon.run",
        requires: ["source_row_hashes", "match_rule_version"],
      },
      {
        action: "correction.approve",
        requires: ["approver_attestation", "sod_check"],
      },
    ],
    governance_policies: [
      { id: "dual_control", threshold_abs: 10000 },
      { id: "hitl_default", material_actions: true },
    ],
    test_scenarios: [
      "amount_mismatch",
      "missing_in_gl",
      "entity_mismatch",
      "orphan_gl",
    ],
    agent_spec: {
      id: "peak.close.crm-gl-revenue",
      pricing: {
        "recon.run": ACTION_CREDITS["recon.run"],
        "exception.resolve": ACTION_CREDITS["exception.resolve"],
        "correction.approve": ACTION_CREDITS["correction.approve"],
      },
    },
    definition: {
      code: "CRM_GL_REV",
      name: "CRM invoices ↔ GL revenue",
      description:
        "Match CRM invoice numbers to GL revenue references for the period.",
      left_system: "crm",
      right_system: "gl",
      tolerance_abs: 0.01,
      materiality_abs: 10000,
    },
  },
  cc_auth_settle_cash: {
    template_id: "cc_auth_settle_cash",
    title: "CC auth ↔ settlements ↔ cash received",
    match_kind: MATCH_KINDS.CC_AUTH_SETTLE_CASH,
    workflow: ["detect", "investigate", "resolve", "report"],
    ontology_extensions: [
      "CardAuth",
      "SettlementLine",
      "BankDeposit",
      "Merchant",
      "Processor",
      "Exception",
      "Evidence",
    ],
    evidence_requirements: [
      {
        action: "recon.run",
        requires: ["processor_file_hash", "batch_id", "match_rule_version"],
      },
      {
        action: "exception.resolve",
        requires: ["fee_schedule_version", "resolution_note"],
      },
      {
        action: "correction.approve",
        requires: ["approver_attestation", "sod_check"],
      },
    ],
    governance_policies: [
      { id: "dual_control", threshold_abs: 10000 },
      { id: "fee_variance_review", threshold_abs: 25 },
      { id: "hitl_default", material_actions: true },
    ],
    test_scenarios: [
      "auth_not_settled",
      "settled_not_received",
      "fee_variance",
      "orphan_deposit",
      "auth_settle_amount_mismatch",
    ],
    agent_spec: {
      id: "peak.close.cc-auth-settle-cash",
      pricing: {
        "recon.run": ACTION_CREDITS["recon.run"],
        "exception.resolve": ACTION_CREDITS["exception.resolve"],
        "correction.approve": ACTION_CREDITS["correction.approve"],
      },
      tools: [
        "mcp://open-finance/processor.settlements.read@1",
        "mcp://open-finance/bank.deposits.read@1",
      ],
    },
    definition: {
      code_prefix: "CC_AUTH_SETTLE",
      name: "CC auth ↔ settlements ↔ cash received",
      description:
        "Three-way match: card authorizations → processor settlements → bank deposits received.",
      left_system: "auth",
      right_system: "settlement_cash",
      tolerance_abs: 0.5,
      materiality_abs: 10000,
    },
  },
  intercompany: {
    template_id: "intercompany",
    title: "Intercompany balances",
    match_kind: MATCH_KINDS.CRM_GL,
    partial: true,
    workflow: ["detect", "investigate", "resolve", "report"],
    ontology_extensions: [
      "IntercompanyBalance",
      "Entity",
      "Exception",
      "Evidence",
    ],
    evidence_requirements: [
      {
        action: "recon.run",
        requires: ["entity_pair", "balance_as_of", "match_rule_version"],
      },
    ],
    governance_policies: [
      { id: "dual_control", threshold_abs: 10000 },
      { id: "hitl_default", material_actions: true },
    ],
    test_scenarios: ["entity_pair_mismatch", "timing_difference"],
    agent_spec: {
      id: "peak.close.intercompany",
      pricing: {
        "recon.run": ACTION_CREDITS["recon.run"],
        "exception.resolve": ACTION_CREDITS["exception.resolve"],
      },
    },
    definition: {
      code_prefix: "IC_BAL",
      name: "Intercompany balances",
      description:
        "Template for intercompany balance reconciliation (partial implement in demo).",
      left_system: "ic_left",
      right_system: "ic_right",
      tolerance_abs: 0.01,
      materiality_abs: 10000,
    },
  },
};

function detectTemplate(needText, startingPointId) {
  if (startingPointId) {
    const sp = STARTING_POINTS.find((s) => s.id === startingPointId);
    if (sp) return sp.template_id;
  }

  const text = (needText || "").toLowerCase();
  if (
    /(cc|card|credit\s*card|auth|settlement|settlements|received|deposit|cash\s*app)/i.test(
      text
    )
  ) {
    return "cc_auth_settle_cash";
  }
  if (/intercompany|inter-company|entity\s*pair/i.test(text)) {
    return "intercompany";
  }
  if (/crm|gl|revenue|invoice|accounting|sox/i.test(text)) {
    return "crm_gl_revenue";
  }
  // Default: treat free text as payments three-way when ambiguous but mentions reconcile
  if (/reconcil/.test(text) && /auth|settle|received/.test(text)) {
    return "cc_auth_settle_cash";
  }
  return "crm_gl_revenue";
}

function buildRequirements(template, needText) {
  return {
    summary: needText,
    objectives: [
      `Stand up ${template.title} on the FinDataGraph control plane`,
      "Preserve SOX-ready lineage and human approval on material actions",
      "Meter per-action credits for agent-native packaging",
    ],
    workflow: template.workflow,
  };
}

export function listStartingPoints() {
  return STARTING_POINTS;
}

export function listSpecs(orgId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, template_id, need_text, title, status, definition_id,
              created_at, implemented_at, package_json
       FROM agent_specs WHERE org_id = ? ORDER BY created_at DESC`
    )
    .all(orgId)
    .map((row) => ({
      ...row,
      package: JSON.parse(row.package_json),
      package_json: undefined,
    }));
}

export function getSpec(orgId, specId) {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM agent_specs WHERE id = ? AND org_id = ?`)
    .get(specId, orgId);
  if (!row) return null;
  return {
    ...row,
    package: JSON.parse(row.package_json),
    package_json: undefined,
  };
}

/**
 * Generate a Spec Studio package from NL need and/or starting-point chip.
 * Seeded CRM↔GL path returns a package that reuses the existing definition.
 */
export function generateSpec({ orgId, userId, need, startingPointId }) {
  const db = getDb();
  const needText = (need || "").trim();
  if (!needText && !startingPointId) {
    const err = new Error("Provide a need description or starting point");
    err.status = 400;
    throw err;
  }

  const templateId = detectTemplate(needText, startingPointId);
  const template = TEMPLATES[templateId];
  if (!template) {
    const err = new Error("Unknown template");
    err.status = 400;
    throw err;
  }

  const resolvedNeed =
    needText ||
    STARTING_POINTS.find((s) => s.id === startingPointId)?.example_need ||
    template.title;

  let reusedDefinition = null;
  if (template.reusable_seed_code) {
    reusedDefinition = db
      .prepare(
        `SELECT id, code, name FROM reconciliation_definitions
         WHERE org_id = ? AND code = ?`
      )
      .get(orgId, template.reusable_seed_code);
  }

  const pkg = {
    template_id: template.template_id,
    title: template.title,
    match_kind: template.match_kind,
    partial: Boolean(template.partial),
    path: reusedDefinition ? "seeded" : "generate",
    reused_definition_id: reusedDefinition?.id || null,
    requirements: buildRequirements(template, resolvedNeed),
    workflow: template.workflow,
    ontology_extensions: template.ontology_extensions,
    evidence_requirements: template.evidence_requirements,
    governance_policies: template.governance_policies,
    test_scenarios: template.test_scenarios,
    agent_spec: template.agent_spec,
    definition_draft: template.definition,
  };

  const specId = id("spec");
  db.prepare(
    `INSERT INTO agent_specs
      (id, org_id, template_id, need_text, title, status, package_json, created_by)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
  ).run(
    specId,
    orgId,
    template.template_id,
    resolvedNeed,
    template.title,
    JSON.stringify(pkg),
    userId
  );

  writeAudit({
    orgId,
    actorId: userId,
    action: AUDIT_ACTIONS.SPEC_GENERATED,
    resourceType: "agent_spec",
    resourceId: specId,
    payload: { template_id: template.template_id, path: pkg.path },
  });

  recordUsage({
    orgId,
    actorId: userId,
    action: "specs.generate",
    resourceType: "agent_spec",
    resourceId: specId,
  });

  return getSpec(orgId, specId);
}

function ensureCcSources(db, orgId) {
  const processor = "src_processor";
  const bank = "src_bank";
  const insert = db.prepare(
    `INSERT OR IGNORE INTO source_systems (id, org_id, code, name, kind)
     VALUES (?, ?, ?, ?, ?)`
  );
  insert.run(processor, orgId, "ADYEN", "Adyen Processor", "processor");
  insert.run(bank, orgId, "JPM", "Operating Bank", "bank");
  return { processor, bank };
}

function seedCcDemoData(db, orgId, entityId, processorId, bankId) {
  const existing = db
    .prepare(`SELECT COUNT(*) AS n FROM cc_auths WHERE org_id = ?`)
    .get(orgId);
  if (existing.n > 0) return;

  const auths = [
    { code: "AUTH-9001", last4: "4242", amt: 1250, date: "2026-09-01" },
    { code: "AUTH-9002", last4: "1111", amt: 890.5, date: "2026-09-01" },
    { code: "AUTH-9003", last4: "5555", amt: 2400, date: "2026-09-02" },
    { code: "AUTH-9004", last4: "9999", amt: 75, date: "2026-09-02" },
    { code: "AUTH-9005", last4: "2222", amt: 510, date: "2026-09-03" },
  ];

  const insertAuth = db.prepare(
    `INSERT INTO cc_auths
      (id, org_id, entity_id, auth_code, card_last4, auth_date, amount, currency, source_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?)`
  );
  for (const a of auths) {
    insertAuth.run(
      id("auth"),
      orgId,
      entityId,
      a.code,
      a.last4,
      a.date,
      a.amt,
      processorId
    );
  }

  // AUTH-9001 clean; AUTH-9002 fee variance path via settle gross=890.50 net lower;
  // AUTH-9003 amount mismatch settle; AUTH-9004 auth not settled; AUTH-9005 settled not received
  const settlements = [
    {
      code: "AUTH-9001",
      batch: "BATCH-77",
      gross: 1250,
      fee: 36.25,
      net: 1213.75,
      date: "2026-09-02",
    },
    {
      code: "AUTH-9002",
      batch: "BATCH-77",
      gross: 890.5,
      fee: 80,
      net: 810.5,
      date: "2026-09-02",
    },
    {
      code: "AUTH-9003",
      batch: "BATCH-78",
      gross: 2300,
      fee: 66.7,
      net: 2233.3,
      date: "2026-09-03",
    },
    {
      code: "AUTH-9005",
      batch: "BATCH-79",
      gross: 510,
      fee: 14.79,
      net: 495.21,
      date: "2026-09-04",
    },
  ];

  const insertSettle = db.prepare(
    `INSERT INTO cc_settlements
      (id, org_id, entity_id, auth_code, batch_id, settle_date, gross_amount, fee_amount, net_amount, currency, source_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?)`
  );
  for (const s of settlements) {
    insertSettle.run(
      id("stl"),
      orgId,
      entityId,
      s.code,
      s.batch,
      s.date,
      s.gross,
      s.fee,
      s.net,
      processorId
    );
  }

  const receipts = [
    { batch: "BATCH-77", ref: "DEP-4001", amt: 2024.25, date: "2026-09-03" }, // 1213.75+810.5
    { batch: "BATCH-88", ref: "DEP-4099", amt: 150, date: "2026-09-05" }, // orphan
  ];

  const insertRcpt = db.prepare(
    `INSERT INTO cc_receipts
      (id, org_id, entity_id, batch_id, deposit_ref, received_date, amount, currency, source_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?)`
  );
  for (const r of receipts) {
    insertRcpt.run(
      id("rcpt"),
      orgId,
      entityId,
      r.batch,
      r.ref,
      r.date,
      r.amt,
      bankId
    );
  }
}

/**
 * Materialize a generated package into runtime definitions (+ CC staging when needed).
 * Seeded CRM↔GL reuses the existing definition (no duplicate).
 */
export function implementSpec({ orgId, userId, specId }) {
  const db = getDb();
  const spec = db
    .prepare(`SELECT * FROM agent_specs WHERE id = ? AND org_id = ?`)
    .get(specId, orgId);
  if (!spec) {
    const err = new Error("Spec not found");
    err.status = 404;
    throw err;
  }
  if (spec.status === "implemented" && spec.definition_id) {
    return getSpec(orgId, specId);
  }

  const pkg = JSON.parse(spec.package_json);
  const template = TEMPLATES[spec.template_id];

  let definitionId = pkg.reused_definition_id;

  if (definitionId) {
    // Seeded path — just link
    db.prepare(
      `UPDATE agent_specs
       SET status = 'implemented', definition_id = ?, implemented_at = datetime('now')
       WHERE id = ?`
    ).run(definitionId, specId);
  } else if (template.partial) {
    // Partial template: create inactive definition marker for showcase
    definitionId = id("rec");
    const code = `${template.definition.code_prefix}_${Date.now().toString(36).toUpperCase()}`;
    db.prepare(
      `INSERT INTO reconciliation_definitions
        (id, org_id, code, name, description, left_system, right_system,
         match_kind, tolerance_abs, materiality_abs, source, spec_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, 0)`
    ).run(
      definitionId,
      orgId,
      code,
      template.definition.name,
      `${template.definition.description} (partial — matcher not live in demo)`,
      template.definition.left_system,
      template.definition.right_system,
      template.match_kind,
      template.definition.tolerance_abs,
      template.definition.materiality_abs,
      specId
    );
    db.prepare(
      `UPDATE agent_specs
       SET status = 'implemented', definition_id = ?, implemented_at = datetime('now'),
           package_json = ?
       WHERE id = ?`
    ).run(
      definitionId,
      JSON.stringify({ ...pkg, partial_implemented: true }),
      specId
    );
  } else {
    definitionId = id("rec");
    const code = `${template.definition.code_prefix || template.definition.code}_${Date.now()
      .toString(36)
      .toUpperCase()}`;

    db.prepare(
      `INSERT INTO reconciliation_definitions
        (id, org_id, code, name, description, left_system, right_system,
         match_kind, tolerance_abs, materiality_abs, source, spec_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, 1)`
    ).run(
      definitionId,
      orgId,
      code,
      template.definition.name,
      template.definition.description,
      template.definition.left_system,
      template.definition.right_system,
      template.match_kind,
      template.definition.tolerance_abs,
      template.definition.materiality_abs,
      specId
    );

    if (template.match_kind === MATCH_KINDS.CC_AUTH_SETTLE_CASH) {
      const { processor, bank } = ensureCcSources(db, orgId);
      const entity = db
        .prepare(
          `SELECT id FROM entities WHERE org_id = ? AND code = 'US-EAST'`
        )
        .get(orgId);
      if (entity) {
        seedCcDemoData(db, orgId, entity.id, processor, bank);
      }
    }

    db.prepare(
      `UPDATE agent_specs
       SET status = 'implemented', definition_id = ?, implemented_at = datetime('now')
       WHERE id = ?`
    ).run(definitionId, specId);
  }

  writeAudit({
    orgId,
    actorId: userId,
    action: AUDIT_ACTIONS.SPEC_IMPLEMENTED,
    resourceType: "agent_spec",
    resourceId: specId,
    payload: { definition_id: definitionId, template_id: spec.template_id },
  });

  recordUsage({
    orgId,
    actorId: userId,
    action: "specs.implement",
    resourceType: "agent_spec",
    resourceId: specId,
  });

  return getSpec(orgId, specId);
}
