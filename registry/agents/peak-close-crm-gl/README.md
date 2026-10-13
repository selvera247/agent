# peak.close.crm-gl-revenue

Week-1 Jumpstart agent package for continuous CRM↔GL revenue reconciliation.

- Manifest: `agent.yaml`
- Ontology: `ontology.json`
- Policies: `policies/`
- Connectors: `connectors/`
- Evals: `evals/scenarios.json` (aligned with seed breaks)
- Process: `SIPOC.md` · gate: `ACCEPTANCE.md`

Runtime: Spec Studio template `crm_gl_revenue` → `CRM_GL_REV` definition → matcher → `GET /reports/jumpstart` / `POST /cluster/run`.
