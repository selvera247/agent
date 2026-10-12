# Week 1 Baseline Report — Collections Recommendation Specialist

**Status:** Complete (locked)  
**Model:** Ollama `qwen2.5-coder:7b`  
**Runner:** `python scripts/run_local_eval.py`  
**Holdout:** 10 examples (`org_99`, `metadata.split=holdout`)  
**Branch / PR:** `cursor/collections-recommendation-specialist-c0ce` · [#8](https://github.com/selvera247/agent/pull/8)

## Objectives (Week 1)

| Objective | Result |
|---|---|
| Run local Ollama baseline on holdout | Done |
| Produce baseline metrics | Locked below |
| Harden prompts / synonyms / evaluator from failure notes | Done |
| Dry-run LoRA data prep (`train_lora_example.sh`) | Done — 15 train chat rows → `models/collections-lora/train_only.jsonl` (gitignored; local only) |
| SME label review packet | Done — `baseline_sme_review.md` (async sign-off checkbox remains) |

## Locked baseline metrics

| Metric | Value |
|---|---|
| action_match_rate | **0.600** |
| policy_pass_rate | **1.000** |
| groundedness_rate | **0.800** |
| hallucination_rate | **0.200** |
| evidence_coverage_mean | **0.683** |
| median_latency_ms | **~9222** (~9.2s laptop Ollama) |

### Trajectory (same holdout)

| Stage | action | policy | grounded | halluc. |
|---|---|---|---|---|
| Raw prompt | 0.50 | 0.80 | 0.50 | 0.50 |
| Allowed-action + policy prompt | 0.70 | 1.00 | 0.40 | 0.60 |
| **Week 1 lock** (after evaluator threshold fixes) | **0.60** | **1.00** | **0.80** | **0.20** |

## Gate assessment

| Gate | Target | Result | Week 1 verdict |
|---|---|---|---|
| policy_pass_rate | ≥ 0.95 | 1.00 | **Met** |
| groundedness_rate | ≥ 0.95 | 0.80 | Carry to Week 2 |
| hallucination_rate | &lt; 0.05 | 0.20 | Carry to Week 2 |
| action vs raw baseline | ≥ raw | 0.60 ≥ 0.50 | **Met** (prompt win) |
| p50 latency | &lt; 1s serving target | ~9s local 7B | Documented; not a laptop ship blocker |

## Failure backlog for Week 2 (LoRA)

| ID | Expected | Typical miss | Priority |
|---|---|---|---|
| `rec_0018` | Keep parent-child grouping | Call AP contact | High |
| `rec_0021` | Hold — await promise-to-pay | Email payment reminder | High |
| `rec_0022` | Escalate to manager | Call AP contact | High |
| `rec_0023` | Email payment reminder | Call AP contact | Medium |
| `rec_0016` | Send automated reminder | Action often correct; evidence noise | Low |

Gold labels for all 10 holdout rows: **keep** (see `baseline_sme_review.md`).

## Artifacts

| Artifact | Location |
|---|---|
| Predictions / metrics (local) | `artifacts/collections_eval/` (gitignored) |
| SME review | `spec/ai-specialist/baseline_sme_review.md` |
| Prompts | `prompts/collections_prompts.md` |
| Eval rules | `spec/ai-specialist/evaluation_spec.md` |
| LoRA starter + train-split prep | `scripts/train_lora_example.sh` |
| Config | `configs/collections_specialist_config.yaml` |

## Privacy

- Pseudonymized gold only; no PII pushed externally
- Model weights / `models/` / eval artifacts stay local
- Ollama inference was localhost

## Week 2 entry criteria

1. SME async sign-off on holdout labels (checkbox in `baseline_sme_review.md`)
2. GPU env with QLoRA (≈16–24GB VRAM) for `Qwen2.5-Coder-7B-Instruct`
3. Train on `split=train` only; never fine-tune on holdout
4. Success = beat Week 1 lock on action_match **and** push hallucination &lt; 0.05 while keeping policy_pass ≥ 0.95
