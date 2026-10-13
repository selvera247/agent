# Product Spec — Collections Recommendation Specialist

## Product statement

A **Collections Recommendation Specialist** turns structured customer AR context into a single JSON recommendation: **action**, **reason**, **confidence** (0–1), and **evidence** (facts present in the input). It is a specialist agent for PeakOS Marketplace, not a chat UI.

## Jobs to be done

1. Recommend the next collections action for one customer portfolio snapshot
2. Stay inside hard staffing/policy constraints
3. Cite only facts that exist in the input (groundedness)

## Inputs (required)

| Field | Description |
|---|---|
| `customer` | Pseudonymized id/name, risk_score, health, strategic_account, contact flags |
| `invoices[]` | Pseudonymized invoice refs, days_past_due, open_balance, dispute/PTP |
| `collector_context` | Assigned collector (pseudonym), availability, skill |
| `policy_flags[]` | Soft/hard flags (e.g. `no_split_customer`, `dispute_specialist_required`) |
| `instruction` | Task prompt (usually fixed template) |

## Outputs (required JSON keys)

| Key | Type | Rules |
|---|---|---|
| `action` | string | From allowed action vocabulary (synonyms mapped in eval) |
| `reason` | string | Concise; no invented entities/amounts/dates |
| `confidence` | float | Inclusive `[0, 1]` |
| `evidence` | string[] | Each item mappable to input fields / derived predicates |

## Allowed actions (v0 vocabulary)

| Canonical action | When typically appropriate |
|---|---|
| `Route to dispute specialist` | Active dispute + dispute skill needed |
| `Send automated reminder` | Low-dollar, low-risk quick win |
| `Call AP contact` | Meaningful AR, medium/high risk, human outreach |
| `Email payment reminder` | Mid-dollar, recent contact gap, non-dispute |
| `Escalate to manager` | Strategic + severe aging or broken promise |
| `Hold — await promise-to-pay` | Valid future PTP date, no new risk spike |
| `Reassign to available collector` | Assigned collector PTO/unavailable (never leave on PTO) |
| `Keep parent-child grouping` | Child account under parent; do not split |

## Non-goals

- Predicting cash exact date or recovery dollars
- Generating customer-facing letter copy
- Mutating ERP assignments (recommendation only)
- Multi-customer batch optimization (single-customer specialist)

## UX / integration

| Surface | Behavior |
|---|---|
| Offline eval | JSONL in → model out → evaluator scores |
| Future API | `POST /agents/collections-recommend` (not in Week 0) |
| Spec Studio | Package listed under AR aging / Collections starting point |

## Privacy

- All customer/org emails and IDs **pseudonymized** before training/eval
- No proprietary rows in public artifacts; gold set is synthetic/pseudonymized
- Data lineage documented in `data/README.md`

## Acceptance (product)

- SME approves 25 gold examples
- Evaluator hard-fails policy violations
- Holdout metrics published for baseline before LoRA pilot
