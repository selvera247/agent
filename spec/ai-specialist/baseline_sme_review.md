# SME holdout review — Ollama baseline (Week 1)

**Source run:** local Ollama `qwen2.5-coder:7b` via `scripts/run_local_eval.py`  
**Reviewer ask:** Confirm gold labels for top failures (below). Model errors ≠ label errors unless noted.

## Metric trajectory

| Run | action_match | policy_pass | groundedness | hallucination | evidence | p50 |
|---|---|---|---|---|---|---|
| Pre-prompt patch | 0.50 | 0.80 | 0.50 | 0.50 | 0.50 | ~9.5s |
| Post allowed-action prompt | 0.70 | **1.00** | 0.40 | 0.60 | — | ~8.0s |
| Routing hints (noisy groundedness) | 0.60 | **1.00** | 0.20 | 0.80 | 0.47 | ~9.0s |
| **Week 1 locked baseline** (threshold fix) | **0.60** | **1.00** | **0.80** | **0.20** | **0.68** | ~9.2s |

### Week 1 gate read

| Gate | Target | Week 1 baseline | Status |
|---|---|---|---|
| policy_pass_rate | ≥ 0.95 | 1.00 | **Pass** |
| groundedness_rate | ≥ 0.95 | 0.80 | Short |
| hallucination_rate | &lt; 0.05 | 0.20 | Short |
| action_match_rate | improve vs raw 0.50 | 0.60 | Improved; LoRA target |
| median latency | &lt; 1s | ~9s local 7B | Document; not a ship blocker for laptop Ollama |

**Remaining real model gaps (LoRA / Week 2):** parent-child vs call (`rec_0018`), escalate vs call (`rec_0022`), email vs call (`rec_0023`), hold-PTP vs email (`rec_0021`).

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

## SME sign-off (async — Week 1 engineering complete)

- [x] Collections SME agrees all 10 holdout expected_actions stand *(confirmed 2026-10-12 by CJ — all good)*
- [x] No gold row needs relabel before LoRA
- [x] Ollama baseline re-run completed after prompt/synonym/evaluator patches (see `week1_baseline_report.md`)

## Notes

- `adapter_or_fallback` perfect scores are the **heuristic stub** (no LoRA weights), not a fine-tuned model.
- Week 1 fully closed including SME label confirmation; ready for Week 2 LoRA.
