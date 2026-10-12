# Evaluation Spec — Collections Recommendation Specialist

## Purpose

Deterministic, auditable scoring of model recommendations. The evaluator is the **ship gate**, not a soft LLM-as-judge.

## Inputs

1. Gold JSONL (`examples.jsonl`) — filtered to `metadata.split=holdout` for official metrics
2. Predictions JSONL — one object per `id` with `action`, `reason`, `confidence`, `evidence`, optional `latency_ms`

## Per-example scores

| Metric | Type | Description |
|---|---|---|
| `policy_pass` | bool | All hard `POL-*` rules pass |
| `grounded` | bool | Reason + evidence claims map to input |
| `action_match` | bool | Canonical action equals expected (after synonym map) |
| `evidence_coverage` | float | Fraction of `expected_evidence` cited (Jaccard-ish / set overlap) |
| `confidence_penalty` | float | Overconfidence vs `expected_confidence` or Brier if label present |
| `hallucinated` | bool | Ungrounded numeric/entity claim detected |

Hard-fail: if `policy_pass=false` or `hallucinated=true`, example fails overall even if action matches.

## Aggregate metrics

| Metric | Definition | Ship threshold (v0) |
|---|---|---|
| `action_match_rate` | mean(`action_match`) | ≥ baseline **or** paired with policy/groundedness win |
| `policy_pass_rate` | mean(`policy_pass`) | ≥ 0.95 |
| `groundedness_rate` | mean(`grounded`) | ≥ 0.95 |
| `hallucination_rate` | mean(`hallucinated`) | **&lt; 0.05** |
| `evidence_coverage_mean` | mean(coverage) | ≥ 0.50 (≥1 expected item typically) |
| `confidence_mae` | mean \|pred − expected\| | Informational |
| `brier_score` | If binary success labels exist | Informational |
| `median_latency_ms` | Placeholder from predictions | Target p50 &lt; 1000 ms |

## Hard policy rules (auditable IDs)

| ID | Rule | Fail condition |
|---|---|---|
| `POL-PTO-01` | Do not assign / leave work on PTO or unavailable collector | Action implies continuing with assigned collector when `availability` ∈ `{pto, unavailable}` **unless** action is `Reassign to available collector` (or synonym) |
| `POL-SPLIT-01` | Do not split a customer | Action or reason proposes splitting invoices/accounts across collectors when `no_split_customer` ∈ `policy_flags` or parent-child grouping applies |
| `POL-STRAT-01` | Strategic accounts need qualified path | `strategic_account=true` and action is automation-only (`Send automated reminder`) → fail |
| `POL-DISPUTE-01` | Dispute requires dispute skill | Any invoice `dispute_flag=true` or flag `dispute_specialist_required` and action routes to non-dispute automation without dispute specialist language → fail |
| `POL-GROUP-01` | Parent-child stay grouped | `parent_child_grouping` flag or `customer.parent_account` set and action proposes isolating child as separate ownership → fail |

Exact string checks for split/isolation keywords are implemented in `scripts/evaluate_collections_recommendations.py` (`SPLIT_KEYWORDS`, `ISOLATE_KEYWORDS`).

## Action synonym map

| Canonical | Accepted synonyms (case-insensitive; `_` normalized to space) |
|---|---|
| `Route to dispute specialist` | `dispute specialist`, `route dispute`, `assign dispute collector`, `assign_dispute_specialist`, `route_to_dispute_specialist` |
| `Send automated reminder` | `auto reminder`, `automation reminder`, `send reminder (auto)`, `send_automated_reminder` |
| `Call AP contact` | `call ap`, `phone ap`, `call customer ap`, `call_ap_contact`, `follow up with customer via phone` |
| `Email payment reminder` | `email reminder`, `send email reminder`, `email_payment_reminder` |
| `Escalate to manager` | `manager escalation`, `escalate manager`, `escalate_to_manager` |
| `Hold — await promise-to-pay` | `hold for ptp`, `await ptp`, `wait on promise`, `hold_for_ptp` |
| `Reassign to available collector` | `reassign collector`, `reassign available`, `reassign_to_available_collector`, `assign available collector` |
| `Keep parent-child grouping` | `maintain parent-child`, `do not split child`, `keep_parent_child_grouping` |

Generic `assign_collector` is **not** accepted (too ambiguous).

## Groundedness

A claim is grounded if it matches one of:

1. Explicit evidence tokens from input-derived predicates (e.g. `risk_score>=80`, `open_ar>100000`, `INV_P_1044.dispute_flag==true`)
2. Numbers that appear in the input JSON (balances, risk scores, DPD)
3. Identifiers present in input (invoice numbers, customer pseudonyms)

Fail if reason invents amounts, DPD, invoice IDs, or collector names not in input.

## Evidence coverage

- Require **≥ 1** overlap between model `evidence` and `expected_evidence` (normalized)
- Score = `|pred ∩ expected| / |expected|`

## Confidence calibration

- If `metadata.success_label` present (0/1): Brier = mean `(confidence − label)^2`
- Else: penalty = `max(0, pred_confidence − expected_confidence − 0.15)` (tolerate ±0.15 band)

## Output artifacts

- Per-example JSON array with scores + failure reasons
- Aggregate JSON + CSV summary
- Top failure cases (policy / hallucination / action mismatch)

## Mapping to Peak V3 / backend (future)

When `docs/peak-v3` and `backend/app/intelligence/scoring.py` land, add rule IDs here with file:line citations. Until then, this document + evaluator code are authoritative.
