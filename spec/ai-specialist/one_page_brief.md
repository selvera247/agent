# Collections Recommendation Specialist — One-Page Brief

| Field | Value |
|---|---|
| **Owner (PM)** | Collections / PeakOS Agent Marketplace |
| **SME reviewer** | Collections SME (AR lifecycle) |
| **Engineering** | Agent eval + LoRA training |
| **Repo** | `selvera247/agent` |
| **Status** | Week 0 scaffold (specs + gold set + evaluator) |

## Scope

Narrow LLM specialist that, given **customer + invoices + collector context**, returns:

```json
{ "action": "...", "reason": "...", "confidence": 0.0, "evidence": ["..."] }
```

Trained on **pseudonymized** internal AR/aging/recommendation lifecycle patterns. Validated with **deterministic** policy, groundedness, and action checks — not vibes.

## Out of scope (this phase)

- Live ERP write-back or collector assignment mutations
- Pushing datasets/weights to public services
- Full Peak V3 collections runtime (paths `docs/peak-v3/*`, `backend/app/intelligence/*` are not yet in this repo; policies are encoded from product brief + FinDataGraph AR signals)

## Deliverables (Week 0)

| Artifact | Path |
|---|---|
| Specs | `spec/ai-specialist/*.md` |
| Gold examples (25; ≥10 holdout) | `data/collections_specialist/examples.jsonl` |
| Dataset builder | `scripts/build_collections_dataset.py` |
| Evaluator + local runner | `scripts/evaluate_*.py`, `scripts/run_local_eval.py` |
| Config / prompts / LoRA starter | `configs/`, `prompts/`, `scripts/train_lora_example.sh` |
| Ollama serving notes | `docs/ai-serving/OLLAMA_README.md` |

## Acceptance criteria (before internal rollout)

1. **Action match** ≥ baseline **or** higher `policy_pass_rate` + `groundedness_rate`
2. **Hallucination rate** &lt; 5%
3. **p50 latency** target documented (&lt; 1s median for internal workflows)
4. **Legal/privacy** sign-off on training data lineage
5. SME review of 25 gold examples + `evaluation_spec.md` rule mapping

## Timeline

| Week | Focus |
|---|---|
| **0** | Specs, 25 gold examples, builder, evaluator, config, prompts, brief |
| **1** | Baseline (Ollama) metrics; LoRA command dry-run |
| **2** | Pilot LoRA; fine-tuned vs baseline comparison report |

## Hard policies (evaluator hard-fail)

- Never assign a **PTO / unavailable** collector
- Never **split** a customer across collectors
- **Strategic** accounts → qualified (non-automation-only) collector path
- Disputed invoices → dispute-capable skill required
- Evidence/reason must be **grounded** in input fields only
