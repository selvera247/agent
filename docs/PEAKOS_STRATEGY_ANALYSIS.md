# Peak Close → PeakOS Strategy Analysis

**Scope:** `main` (marketing/pattern demo) + `origin/cursor/peak-close-mvp-a395` (headless reconciliation MVP)  
**Repo:** [selvera247/agent](https://github.com/selvera247/agent)  
**Lens:** PeakOS intelligence platform thesis — Agent Marketplace, Spec Studio, Trust Cloud, Knowledge Graph, Open Finance Agent Registry, and the market shift to agent-native / per-call economics.

---

## Executive verdict

Peak Close already encodes the **right operating loop** (detect → investigate → resolve → report) and the **right durability language** (governance, certified metrics, lineage, human-in-the-loop). What exists today is split across two incomplete surfaces:

| Surface | What it is | PeakOS value |
|---|---|---|
| `main` | Static Vite narrative (`src/content.js`, `src/App.jsx`) | Strong thesis storytelling; zero runtime primitives |
| MVP branch | API-first CRM↔GL control plane | Real Identity-lite, Audit-lite, Approvals-lite, matching engine — but still a **single finance app**, not an agent platform |

**The strategic opportunity:** treat Peak Close not as “the close product,” but as the **first Agent Marketplace SKU** whose Spec Studio intake is the existing starting-point copy (“Pick one high-pain reconciliation…”), and whose runtime produces Trust Cloud evidence + Knowledge Graph objects on every loop step.

---

## 1. Map to PeakOS primitives & Agent Marketplace

### 1.1 What the demo already aligns with

| PeakOS primitive | Where it shows up | Alignment quality |
|---|---|---|
| **Agent orchestration (loop)** | `src/content.js` `flow` (Detect/Investigate/Resolve/Report); MVP `matching.js` + `exceptions.js` + (missing Report) | **Strong conceptually**; MVP implements Detect + Resolve subset |
| **Governance language** | `src/App.jsx` `#governance`; MVP RBAC + dual-control + `audit_log` | **Strong narrative**; MVP is soft governance (roles + $10k threshold), not a policy engine |
| **Identity** | MVP `users` + JWT + roles `admin/controller/accountant` + entity scope | **Partial** — tenant-ready (`org_id`), not enterprise IdP |
| **Audit** | MVP `audit_log` + `apps/api/src/lib/audit.js` + `/audit` UI | **Partial** — mutation log, not immutable evidence |
| **Evidence (nascent)** | README calls audit “append-only evidence”; marketing SOX/lineage copy | **Naming only** — no evidence objects, hashes, attestations, or artifact store |
| **Ontology (nascent)** | Marketing: “semantic/ontology layer” in capabilities; certified staging table names | **Absent as data model** — no metric defs, fiscal calendars, entity rollups |
| **Marketplace intake** | `startingPoints[0]`: “Pick one high-pain reconciliation (CRM-to-accounting revenue, intercompany, or AR aging)” | **Perfect Spec Studio on-ramp copy** — not wired to generation |
| **Platform-agnostic Connect story** | `platforms[]` (Databricks / Snowflake / warehouse+SQL / BigQuery-Fabric) | **GTM-aligned**; MVP is SQLite-only with static `source_systems` labels |

### 1.2 Detect → Investigate → Resolve → Report vs MVP reality

```
Marketing loop (content.js / App.jsx #flow)
  Detect       → BI & exception dashboards
  Investigate  → conversational analytics on ontology
  Resolve      → action apps + dual control + write-back
  Report       → variance commentary + leadership pack

MVP reality (peak-close-mvp-a395)
  Detect       ✅ matching engine → exceptions
  Investigate  ⚠️ dashboard + exception detail (no NLQ / ontology)
  Resolve      ✅ assign / resolve / waive / dual-control corrections
               ❌ no ERP write-back (corrections are ledger records only)
  Report       ❌ not implemented
```

### 1.3 Agent Marketplace coverage

Peak Close maps cleanly to one Marketplace category (**Reconciliation / Continuous Close**). Adjacent SKUs implied by starting points and outcomes, but not modeled:

| Marketplace agent | Demo signal | Code readiness |
|---|---|---|
| Reconciliation (CRM↔GL) | Seeded `CRM_GL_REV` definition | MVP works |
| Intercompany | Listed in starting points + flow intro | Missing |
| AR aging / Collections | Starting points; consulting DSO outcome | Missing |
| AP / Cash App / RevRec / Vendor Statement / Forecast | Strategy only | Missing |

**Missing for Marketplace vision:** agent versioning, tool policies, per-action pricing metadata, MCP tool contracts, eval suites, installable agent packages, multi-agent supervisor.

### 1.4 Gap summary (primitives)

| Primitive | Status |
|---|---|
| Identity | MVP JWT/RBAC only |
| Evidence / Trust Cloud | Audit rows ≠ evidence fabric |
| Ontology / Knowledge Graph | Marketing word; no graph objects |
| Governance | Soft dual-control; no policy DSL |
| Decision Intelligence | Outcomes anecdotes; no decision model |
| Connect | Narrative platforms; no connectors |
| Spec Studio | Intake copy only |
| Agent Marketplace / Open Registry | Absent |
| Per-action pricing | Absent |

---

## 2. Spec Studio readiness: NL need → structured artifacts

### 2.1 Natural Spec Studio intake already in the product

The marketing starting points are Spec Studio’s first prompt templates:

```text
# from src/content.js startingPoints
"Pick one high-pain reconciliation (CRM-to-accounting revenue, intercompany, or AR aging)."
"Certify key metrics in your catalog / semantic layer..."
"Stand up one or two agents..."
"Add a thin app for controlled resolution and write-back with audit tables."
"Expand to continuous close and multi-entity consolidation..."
```

A Spec Studio utterance like *“continuous CRM-to-accounting revenue reconciliation with SOX lineage”* is exactly what the MVP seed already hardcodes (`CRM_GL_REV`, Salesforce ↔ NetSuite, materiality $10k).

### 2.2 What a generative backend would need to emit

| Artifact | Today | Spec Studio target |
|---|---|---|
| Requirements | Hardcoded hero/problem copy in `App.jsx` | `spec/requirements.md` generated from NL |
| Workflow | Static `flow[]` | Executable state machine (exception lifecycle already close) |
| Ontology extensions | — | Invoice → Customer → Entity → GL Account → Exception → Correction → Evidence |
| Evidence requirements | — | Required evidence types per action (match proof, approval attestation, SOX lineage) |
| Governance policies | Hardcoded `$10k` in `MATERIALITY_USD` | Policy package: SoD, materiality, HITL defaults, retention |
| Test scenarios | `seed.js` breaks (INV-1002 mismatch, INV-1005 entity, INV-1007 missing GL, INV-1099 orphan) | Generated eval suite from same scenarios |
| Agent spec + pricing | — | Agent manifest with tools, permissions, per-action credits |

### 2.3 Gaps between static demo and generative Spec Studio

1. **Content is presentation, not schema.** `content.js` arrays cannot be compiled into agents; there is no JSON Schema / OpenAPI / ontology IDL.
2. **MVP `reconciliation_definitions` is a thin config row** (`left_system`, `right_system`, tolerance, materiality) — matcher ignores left/right and hardcodes CRM↔GL tables (`matching.js`).
3. **No generation API** (`POST /specs/generate` or similar).
4. **No artifact store** for versioned specs, policies, or eval fixtures.
5. **Seed scenarios are gold for evals** but not packaged as an evaluation suite publishable to an Open Registry.
6. **Governance is imperative code** (role checks in routes) rather than declarative policy the Spec Studio could emit and the runtime could enforce.

### 2.4 Spec Studio → implementation agent path (fit)

```
User NL need
    → Spec Studio generates package
    → Implementation agent materializes:
         ontology deltas · evidence schemas · policies ·
         reconciliation definition · matching rules ·
         UI surfaces · eval fixtures · agent pricing metadata
    → Peak Close runtime executes detect→…→report
    → Trust Cloud records evidence per action
```

The MVP’s bounded contexts (`Identity · Master data · Reconciliation · Exceptions · Approvals · Audit` in `docs/ARCHITECTURE.md`) are the right **runtime hosts** for Spec Studio outputs — they just need to become first-class, versioned resources instead of SQLite tables filled by a one-shot seed.

---

## 3. Pricing & packaging implications

### 3.1 Current design assumes seats (implicitly)

| Signal | Implication |
|---|---|
| Roles: admin / controller / accountant | Seat-style RBAC product mental model |
| Login UX with named demo users | Human-user SaaS framing |
| No metering tables / usage events | Cannot bill per run, per exception, per resolution |
| Matching is a manual “Run now” | Natural **per-run** or **per-exception-resolved** meter not instrumented |
| Dual-control corrections | High-value actions that should be credit-priced, but aren’t |

**Verdict:** Not seat-locked in code (no seat counters), but **not ready for agent-native per-call packaging** either. It sits in a vacuum between classic finance SaaS and Treg-style unbundled tool catalogs.

### 3.2 Recommended Peak Close packaging (agent-native)

| Meter | Unit | Rationale |
|---|---|---|
| `recon.run` | Per matching job | Detect step |
| `exception.investigate` | Per NLQ / graph expand / evidence pack | Investigate step |
| `exception.resolve` | Per resolve/waive | Resolve step |
| `correction.approve` | Per dual-control decision | Governance premium |
| `report.generate` | Per leadership pack | Report step |
| External MCP tool calls | Pass-through + margin | Treg-style dependencies |

### 3.3 Where Treg-style per-call tools fit

External enrichment / matching / document tools should appear as **declared dependencies** on the agent spec, not baked into Peak Close:

```yaml
# conceptual agent manifest fragment
agent: peak.close.crm-gl-revenue
pricing:
  model: credits
  actions:
    recon.run: 10
    exception.resolve: 3
    correction.approve: 5
tools:
  - mcp://open-finance/netsuite.gl.read@1
  - mcp://open-finance/salesforce.billing.read@1
  - mcp://vendor/fuzzy-match@2   # per-call external
policies:
  - sox.lineage.required
  - dual_control.above_materiality
```

Peak Connect brokers MCP calls; Trust Cloud stores evidence of each call; PeakOS Runtime meters credits. Peak Close stays the **governed orchestration SKU**, not the enrichment vendor.

---

## 4. Durability / Lindyness assessment

Market signals say: token launchpads / GPU brokerage / pure data plays are cyclical; **governed ontology + evidence + orchestration** compound. Map Peak Close through that filter:

### 4.1 Compounding assets (keep and deepen)

| Asset | Current foothold | Why Lindy |
|---|---|---|
| **Exception + correction objects** | `exceptions`, `corrections` tables | Institutional memory of breaks and how finance resolved them |
| **Audit trail** | `audit_log` | Controllership / SOX substrate → Trust Cloud |
| **Reconciliation definitions** | `reconciliation_definitions` | Reusable agent specs once generalized |
| **Certified staging metaphor** | `crm_invoices`, `gl_revenue_lines` | Seed of Knowledge Graph + certified metrics |
| **Materiality / dual-control pattern** | `MATERIALITY_USD` + pending_approval | Governance primitive reusable across Marketplace agents |
| **Platform-agnostic capability map** | `platforms` + `capabilities` | Connect abstraction story (durable GTM) |
| **Seed break taxonomy** | amount / missing / entity mismatch | Ontology of exception types — eval + Registry content |

### 4.2 Short-cycle / commoditizable features

| Feature | Risk |
|---|---|
| Static marketing page alone | Easily copied; no lock-in |
| Hardcoded CRM↔GL string-match engine | Commodity matching; vendors + LLM tools will crush naive equality matching |
| Local JWT demo auth | Table stakes |
| Anecdotal outcomes section | Not a product asset |
| Platform tab cosmetics (Genie/Cortex names) | Vendor-feature chasing; decays as stacks rename |

### 4.3 Lindyness scorecard

```
High durability   ████████░░  governance loop language, exception ontology, audit pattern
Medium            █████░░░░░  MVP control plane (needs evidence + ontology elevation)
Low               ██░░░░░░░░  marketing shell alone; hardcoded matcher; seat-shaped UX
```

**Strategic implication:** Invest next engineering cycles in elevating audit → Evidence, staging → Knowledge Graph ontology, and definitions → publishable agent specs — not in prettier platform tabs or more case-study cards.

---

## 5. Concrete next steps (demo → Spec Studio + governed agent loop showcase)

### 5.1 Recommended repo structure

Merge the MVP monorepo shape with Spec Studio / Registry seams:

```
peak-close/
├── apps/
│   ├── api/                 # existing control plane (keep)
│   ├── web/                 # controller UI (keep) + Spec Studio intake page
│   └── marketing/           # current main Vite narrative (optional preserve)
├── packages/
│   ├── shared/              # roles, statuses (keep)
│   ├── ontology/            # NEW: entity types, relations, certified metrics
│   ├── evidence/            # NEW: evidence schemas + hash/attest helpers
│   ├── policy/              # NEW: materiality, SoD, HITL policy DSL
│   └── agent-spec/          # NEW: agent manifest schema + pricing metadata
├── registry/                # NEW: publishable Open Finance Agent Registry package
│   ├── agents/peak-close-crm-gl/
│   │   ├── agent.yaml
│   │   ├── ontology.json
│   │   ├── policies/
│   │   ├── evals/
│   │   └── README.md
│   └── mcp/                 # connector stubs (Salesforce, NetSuite)
├── specs/                   # NEW: Spec Studio outputs (versioned)
│   └── examples/
│       └── crm-gl-revenue-sox/
└── docs/
    ├── ARCHITECTURE.md      # extend with primitives map
    └── PEAKOS_STRATEGY_ANALYSIS.md  # this doc
```

### 5.2 API surface for the generation step

Add a Spec Studio façade (can be stubbed with deterministic templates initially):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/specs/generate` | NL need → draft package (requirements, workflow, ontology delta, evidence reqs, policies, evals, agent.yaml + pricing) |
| `GET` | `/api/v1/specs` | List generated specs |
| `GET` | `/api/v1/specs/:id` | Fetch package |
| `POST` | `/api/v1/specs/:id/implement` | Materialize definition + policies into runtime tables |
| `POST` | `/api/v1/agents/:id/actions/:action` | Metered action entrypoint (run / resolve / approve / report) |
| `GET` | `/api/v1/evidence/:id` | Trust Cloud read |
| `GET` | `/api/v1/graph/subgraph` | Knowledge Graph expand around invoice/exception |

**Minimal `POST /specs/generate` request/response sketch:**

```json
// request
{
  "need": "continuous CRM-to-accounting revenue reconciliation with SOX lineage",
  "starting_point": "crm_to_accounting_revenue",
  "platform": "warehouse-sql"
}

// response (package)
{
  "spec_id": "spec_crm_gl_rev_001",
  "requirements": { "...": "..." },
  "workflow": ["detect", "investigate", "resolve", "report"],
  "ontology_extensions": ["Invoice", "GlRevenueLine", "Exception", "Correction", "Evidence"],
  "evidence_requirements": [
    { "action": "recon.run", "requires": ["source_row_hashes", "match_rule_version"] },
    { "action": "correction.approve", "requires": ["approver_attestation", "sod_check"] }
  ],
  "governance_policies": [
    { "id": "dual_control", "threshold_abs": 10000 },
    { "id": "hitl_default", "material_actions": true }
  ],
  "test_scenarios": ["amount_mismatch", "missing_in_gl", "entity_mismatch", "orphan_gl"],
  "agent_spec": {
    "id": "peak.close.crm-gl-revenue",
    "pricing": { "recon.run": 10, "exception.resolve": 3 }
  }
}
```

Bootstrap generation from existing assets: map `startingPoints` → templates; map `seed.js` breaks → `test_scenarios`; map `MATERIALITY_USD` → first policy; map `EXCEPTION_TYPES` → ontology enums.

### 5.3 Productize the loop as the showcase narrative

1. **Keep marketing hero**, but change CTA from “Compare platforms” → **“Describe your reconciliation”** (Spec Studio intake).
2. **Wire starting points as chips** that prefill the NL box.
3. After generate → implement → **auto-run** matching → land on Exceptions (today’s MVP UI).
4. On each resolve/approve, show an **Evidence drawer** (elevate `audit_log` payloads into first-class evidence cards).
5. Add a thin **Report** endpoint that drafts variance commentary from governed exception aggregates (closes the loop gap).
6. Surface a **credits used** strip on Dashboard (even if fake credits) to demonstrate agent-native packaging.

### 5.4 What to publish to an Open Finance Agent Registry

From this repo, ship as the first Registry package:

| Artifact | Source to extract |
|---|---|
| Agent spec `peak.close.crm-gl-revenue` | `reconciliation_definitions` + exception lifecycle |
| Ontology fragment (Invoice, GL line, Exception types) | `schema.sql` + `EXCEPTION_TYPES` |
| Governance policy pack (materiality, dual-control, HITL) | `MATERIALITY_USD` + exceptions routes |
| Eval suite | `seed.js` scenarios + `api.test.js` |
| Connector stubs | `source_systems` kinds → MCP server skeletons (`crm.read`, `erp.gl.read`) |
| Evidence schema | generalize `audit_log` → signed evidence events |

Position: **Docker Hub / npm for finance agents** — Peak Close is the reference Reconciliation agent, not a closed SaaS silo.

### 5.5 Sequencing (technical, not calendar)

1. **Elevate Evidence** — wrap every `writeAudit` call into an `evidence` table with hash, action, actor, inputs, policy_version.
2. **Generalize definitions** — stop hardcoding CRM/GL tables; drive matcher from definition + ontology bindings.
3. **Spec generate stub** — template-based `/specs/generate` using starting points.
4. **Metering** — `usage_events` on run/resolve/approve; Dashboard credits.
5. **Registry package** — export `registry/agents/peak-close-crm-gl/`.
6. **Report step** — commentary generator from certified aggregates.
7. **MCP Connect stubs** — replace seed inserts with tool calls behind feature flag.

---

## 6. Tensions with strategic priorities

| Tension | Detail |
|---|---|
| **App vs platform** | Branding and README still read as a single close/reconciliation product; strategy wants Marketplace of many agents on shared primitives. |
| **Platform-agnostic marketing vs SQLite MVP** | `platforms[]` promises Databricks/Snowflake/Fabric; runtime is one Node+SQLite app. Risk: buyers see vaporware unless Connect adapters or “runs on your lakehouse” path is real. |
| **“Agents” in copy, zero agents in code** | Capabilities #5 and platform stacks name Agent Bricks / Cortex Agents / Temporal+LLM; MVP has no agent runtime, tool policy, or supervisor. |
| **Ontology named, not modeled** | Conversational analytics claim depends on semantic/ontology layer that does not exist in schema. |
| **Evidence conflated with audit** | README “append-only evidence” overclaims; Trust Cloud thesis needs stronger primitive. |
| **Seat-shaped UX vs per-call thesis** | Controller/accountant logins and role gates teach seat SaaS; market signal (Treg) says agents unbundle seats into calls. |
| **Hardcoded matcher vs Registry/MCP** | Equality matching on invoice number is a demo; durable value is governance + ontology + orchestration around *pluggable* match tools. |
| **Report step missing** | Loop is incomplete; undermines “continuous close” claim. |
| **No SoD on dual-control** | Approver can be proposer (`exceptions.js`); weakens SOX story central to Spec Studio example need. |
| **Outcomes section = borrowed lakehouse ROI** | Anecdotes read as Databricks/Snowflake case studies; dilutes PeakOS-native proof. Prefer evidence from the MVP seed loop. |
| **Two diverging branches** | `main` marketing vs `peak-close-mvp-a395` product — strategy demo needs them unified so Spec Studio intake and governed runtime share one story. |

---

## Priority recommendations (what makes Peak Close a stronger PeakOS thesis demo)

1. **Unify surfaces:** merge MVP into main; keep the marketing narrative as the Spec Studio front door, not a separate dead-end page.
2. **Make starting points executable:** chips → `/specs/generate` → implement → run → exceptions.
3. **Promote audit → Evidence** and show it in the UI on every material action (Trust Cloud showcase).
4. **Add metering + agent.yaml** so pricing is visibly per-action, not per-seat.
5. **Publish the CRM↔GL agent pack** to a local `registry/` as the first Open Finance Agent Registry specimen.
6. **Fix SoD + Report** — small changes, large credibility for SOX lineage claims.
7. **Stop investing in more platform-tab chrome** until Connect/MCP stubs exist; the durable story is primitives, not vendor name-dropping.

---

## Appendix: key file index

### Marketing demo (`main`)

| Path | Role |
|---|---|
| `src/content.js` | platforms, capabilities, flow, outcomes, startingPoints |
| `src/App.jsx` | sections incl. hardcoded `#governance` |
| `src/App.css` | visual system |
| `package.json` | Vite/React only |

### MVP (`origin/cursor/peak-close-mvp-a395`)

| Path | Role |
|---|---|
| `docs/ARCHITECTURE.md` | bounded contexts, scalability path |
| `README.md` | API map, schema summary |
| `apps/api/src/db/schema.sql` | org→audit relational model |
| `apps/api/src/db/seed.js` | Peak Retail Co scenarios |
| `apps/api/src/services/matching.js` | CRM↔GL matcher |
| `apps/api/src/routes/exceptions.js` | lifecycle + dual-control |
| `apps/api/src/lib/audit.js` | audit writer |
| `apps/api/src/middleware/auth.js` | JWT + RBAC |
| `packages/shared/src/index.js` | roles, statuses, `MATERIALITY_USD` |
| `apps/web/src/pages/*` | Dashboard, Exceptions, Runs, Audit |

---

*Generated as a strategic analysis of the Peak Close demo against the PeakOS Agent Marketplace / Spec Studio / Trust Cloud thesis.*
