/** Platform-agnostic Continuous Close & Reconciliation pattern content */

export const platforms = [
  {
    id: "databricks",
    name: "Databricks",
    stack: {
      foundation: "Lakeflow + Unity Catalog + Delta",
      bi: "AI/BI Dashboards",
      converse: "Genie / Genie One + Genie Agents",
      action: "Databricks Apps + Lakebase",
      agents: "Agent Bricks / Supervisor Agents",
    },
  },
  {
    id: "snowflake",
    name: "Snowflake",
    stack: {
      foundation: "Snowpipe / Dynamic Tables + Horizon Catalog",
      bi: "Snowsight, Streamlit in Snowflake, partner BI",
      converse: "Cortex Analyst / Snowflake Intelligence",
      action: "Streamlit Apps + Unistore / Postgres write-back",
      agents: "Cortex Agents + stored procedures",
    },
  },
  {
    id: "warehouse-sql",
    name: "Warehouse + MySQL / Postgres",
    stack: {
      foundation: "ETL/ELT into warehouse; MySQL/Postgres for ops + ledger mirrors",
      bi: "Looker, Power BI, Metabase, Tableau",
      converse: "Text-to-SQL / semantic layer copilots (dbt + LLM)",
      action: "Internal finance apps writing to MySQL/Postgres with audit tables",
      agents: "Orchestrators (Airflow, Temporal) + LLM agents with tool policies",
    },
  },
  {
    id: "bigquery",
    name: "BigQuery / Fabric",
    stack: {
      foundation: "Managed pipelines + governed datasets / OneLake",
      bi: "Looker, Power BI, Fabric reports",
      converse: "Gemini in BigQuery / Copilot in Fabric",
      action: "Apps Script, Power Apps, or custom services with audited writes",
      agents: "Vertex / Fabric agents with governed tools",
    },
  },
];

export const capabilities = [
  {
    title: "Governed data foundation",
    body: "Ingest and unify ERP, CRM, HRIS, billing, and planning into certified tables with lineage, row/column security, and SOX-ready audit trails. The close stops being a monthly extract fire drill when pipeline-to-GL and accrued revenue vs. forecast stay continuously visible.",
  },
  {
    title: "BI & exception dashboards",
    body: "Surface reconciliation status, open exceptions, P&L/revenue KPIs, balance sheet, working capital, and budget variance. Controllers start here to spot issues before the period locks.",
  },
  {
    title: "Conversational analytics",
    body: "Natural-language questions grounded in a semantic/ontology layer (fiscal calendars, entity rollups, certified metrics) and the platform’s permission model. Answers ship with sourced SQL so “why” stays auditable.",
  },
  {
    title: "Action apps with guardrails",
    body: "Upload files, trigger reconciliation jobs, approve or correct entries with write-back, and generate decks/PDFs—always with human approval and timestamped audit records. Operational stores (Lakebase, Unistore, MySQL, Postgres) handle controlled mutations.",
  },
  {
    title: "Optional multi-step agents",
    body: "For document extraction, rules engines, forecast/reserve models, or overnight matching runs. Agents are versioned and permissioned; material actions stay human-in-the-loop by default.",
  },
];

export const flow = [
  {
    step: "01",
    title: "Detect",
    body: "Dashboards highlight unreconciled items, amount mismatches, missing records, or material variances across entities and subledgers.",
  },
  {
    step: "02",
    title: "Investigate",
    body: "Controllers ask the conversational layer: clear remaining items, flag intercompany balances above threshold, or rank late-period manual journals. Issues group into actionable buckets with ownership.",
  },
  {
    step: "03",
    title: "Resolve",
    body: "Finance apps apply validated corrections, re-run jobs, or post approved entries—with lineage back to source and full approval history.",
  },
  {
    step: "04",
    title: "Report",
    body: "Draft variance commentary from governed metrics; generate the leadership pack inside the same controlled environment—not a side spreadsheet.",
  },
];

export const outcomes = [
  {
    title: "Office of the CFO (lakehouse)",
    detail:
      "Unified ERP, CRM, HRIS, and planning. Revenue close cut from 15 days to 8 (~52%), saving roughly 50 hours per person per month with SOX-ready lineage on certified metrics.",
  },
  {
    title: "Global consulting firm",
    detail:
      "Conversational analytics shortened cash-forecasting cycles by 3–5 days and cut reporting-cycle FTE hours by ~80%. Each day of DSO improvement moved material cash at scale.",
  },
  {
    title: "Large telecom CFO org",
    detail:
      "Thousands of finance users treat the reasoning agent as the front door across billing, AP, and spend. Multi-day Excel reconciliations compress to minutes with sourced answers.",
  },
  {
    title: "Global CPG finance",
    detail:
      "Insights moved from days to minutes; teams explore freely against consistent definitions, with multi-million annual cost avoidance from sharper analysis and continuous risk management.",
  },
  {
    title: "Top-tier bank liquidity",
    detail:
      "Regulatory liquidity reporting compressed from ~10 hours to minutes when GL and position data stayed near-real-time under governed pipelines.",
  },
];

export const startingPoints = [
  "Pick one high-pain reconciliation (CRM-to-accounting revenue, intercompany, or AR aging).",
  "Certify key metrics in your catalog / semantic layer (Unity Catalog, Horizon, dbt metrics, LookML, etc.).",
  "Stand up one or two agents or Genie/Cortex spaces for variance and exceptions.",
  "Add a thin app for controlled resolution and write-back with audit tables.",
  "Expand to continuous close and multi-entity consolidation once the foundation is trusted.",
];
