# Discovery — Collections Recommendation Specialist

## Problem

Collections teams spend significant time deciding *what to do next* on aged AR: call, email, automate, escalate dispute, regroup parent/child, or hold. Ad-hoc judgment invents facts, violates staffing policy (PTO assignment, customer split), and is hard to audit.

## Opportunity in this repo

FinDataGraph / Peak Close already frames **AR aging / Collections** as an adjacent Agent Marketplace SKU (`docs/PEAKOS_STRATEGY_ANALYSIS.md`). Spec Studio starting points mention AR aging. This specialist is the first **narrow, evaluable** agent package for that SKU — not a full collections product.

## Users

| Persona | Need |
|---|---|
| Collector | Next best action grounded in invoice + risk facts |
| Collections manager | Policy-compliant routing; no PTO / no split |
| Controllership / Trust Cloud | Auditable evidence strings mapped to inputs |
| PeakOS marketplace | Versioned agent with eval suite + credit meter later |

## Current state (repo facts)

| Area | Finding |
|---|---|
| `backend/app/intelligence/scoring.py` | **Not present** on `main` — referenced in product brief as future Peak V3 source |
| `docs/peak-v3/products/collections-intelligence/*` | **Not present** — encode policies from this brief until docs land |
| `crm_invoices` / matching | Exists; useful as **pseudonymized staging seed** for synthetic AR rows |
| Playwright / SDD suites | **Not present** on `main` — behavioral scenarios deferred |

## Policy sources (authoritative for Week 0)

1. Product brief hard rules (PTO, no-split, strategic qualification, dispute skill)
2. FinDataGraph materiality / dual-control ethos (`MATERIALITY_USD = 10000`) as analogy for “meaningful AR” thresholds
3. SME-curated gold examples in `data/collections_specialist/examples.jsonl`

## Success signals

- Deterministic evaluator can fail a bad model for policy + hallucination
- Holdout examples (org- or time-based) never leak into training prompts
- Baseline vs LoRA comparison is reproducible via `scripts/run_local_eval.py`

## Risks

| Risk | Mitigation |
|---|---|
| Proprietary customer data leak | Pseudonymize in builder; never push weights/datasets externally |
| Label leakage across split | Holdout by `organization_id` + `metadata.split=holdout` |
| Spec drift vs Peak V3 docs | `evaluation_spec.md` rule IDs; update when peak-v3 lands |
| Overfitting gold set | Cap few-shot prompts; keep ≥10 holdout exclusive |

## Decision

Proceed with **synthetic-but-schema-faithful** gold data + deterministic eval. Wire real Peak V3 extracts when internal read-only export is approved.
