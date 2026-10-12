# SME holdout review — Ollama baseline (Week 1)

**Source run:** local Ollama `qwen2.5-coder:7b` via `scripts/run_local_eval.py`  
**Reviewer ask:** Confirm gold labels for top failures (below). Model errors ≠ label errors unless noted.

## Metric trajectory

| Run | action_match | policy_pass | groundedness | hallucination | p50 |
|---|---|---|---|---|---|
| Pre-prompt patch | 0.50 | 0.80 | 0.50 | 0.50 | ~9.5s |
| Post allowed-action prompt | **0.70** | **1.00** | 0.40 | 0.60 | ~8.0s |

Policy hard-fails cleared. Remaining issues: over-use of `Keep parent-child grouping` on non-parent rows, and evidence/reason grounding (often **action correct** but evidence format fails).

## Top failure cases — gold label verdict

| ID | Expected action | Key facts | Gold verdict | Model issue |
|---|---|---|---|---|
| `rec_0019` | Reassign to available collector | collector `pto`; flag `no_pto_assignment` | **Keep** — POL-PTO-01 | Predicted `No action required`; ignored PTO |
| `rec_0024` | Reassign to available collector | collector `unavailable` | **Keep** — POL-PTO-01 | Predicted `assign_collector`; ignored unavailable |
| `rec_0017` | Route to dispute specialist | strategic + `dispute_flag` on INV_P_17001 | **Keep** | Near-miss vocab (`assign_dispute_specialist`); grounding/evidence format weak |
| `rec_0022` | Escalate to manager | strategic, critical, DPD 200, AR 510k | **Keep** | Predicted generic `assign_collector` |
| `rec_0025` | Route to dispute specialist | dispute on INV_P_25001; elevated risk/AR | **Keep** | Predicted `assign_collector` instead of dispute route |

## Other holdout labels (spot-check)

| ID | Expected | Verdict |
|---|---|---|
| `rec_0016` | Send automated reminder | **Keep** — low AR / low risk / quick-win |
| `rec_0018` | Keep parent-child grouping | **Keep** — parent_account + grouping flag |
| `rec_0020` | Call AP contact | **Keep** — material AR + risk≥60 |
| `rec_0021` | Hold — await promise-to-pay | **Keep** — future PTP, risk&lt;50 |
| `rec_0023` | Email payment reminder | **Keep** — mid-dollar non-dispute |

## SME sign-off

- [ ] Collections SME agrees all 10 holdout expected_actions stand
- [ ] No gold row needs relabel before LoRA
- [ ] After prompt/synonym patch, re-run Ollama baseline and attach new `summary.md`

## Notes

- `adapter_or_fallback` perfect scores in the first local run were the **heuristic stub** (no LoRA weights), not a fine-tuned model.
- Prompt + synonym patch aims to reduce vocab mismatch and PTO misses before training.
