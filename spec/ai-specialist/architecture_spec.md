# Architecture Spec — Collections Recommendation Specialist

## System context

```
┌─────────────────────┐     JSONL / API later      ┌──────────────────────────┐
│ Dataset builder     │ ─────────────────────────► │ examples.jsonl (gold)    │
│ (pseudonymize)      │                            └────────────┬─────────────┘
└─────────────────────┘                                         │
                                                                ▼
┌─────────────────────┐     prompts + config       ┌──────────────────────────┐
│ Ollama / LoRA serve │ ◄───────────────────────── │ run_local_eval.py        │
└─────────┬───────────┘                            └────────────┬─────────────┘
          │ model outputs                                       │
          ▼                                                     ▼
┌─────────────────────┐                            ┌──────────────────────────┐
│ outputs/*.jsonl     │ ─────────────────────────► │ evaluate_collections_…   │
└─────────────────────┘                            │ → metrics JSON/CSV       │
                                                   └──────────────────────────┘
```

## Components

| Component | Responsibility |
|---|---|
| `scripts/build_collections_dataset.py` | Normalize + pseudonymize → JSONL |
| `prompts/collections_prompts.md` | System / few-shot / zero-shot templates |
| `configs/collections_specialist_config.yaml` | Train / eval / serve knobs |
| Baseline runtime | Ollama `qwen2.5-coder:7b` (default) |
| Fine-tune path | LoRA/QLoRA adapter under `models/collections-lora/` (local only) |
| `scripts/evaluate_collections_recommendations.py` | Deterministic rubric |
| `scripts/run_local_eval.py` | Orchestrate baseline ± adapter → compare |

## Data flow

1. Internal extract or synthetic fixtures enter the builder
2. Builder emits schema-valid JSONL with `metadata.split` ∈ `{train, holdout}`
3. Train path (Week 1–2) uses `split=train` only; few-shot prompts never include holdout IDs
4. Eval always runs on `split=holdout`
5. Metrics written under `artifacts/collections_eval/` (gitignored weights; metrics OK)

## Trust boundaries

| Boundary | Rule |
|---|---|
| Public git | Pseudonymized gold + code only |
| External model APIs | **Forbidden** for proprietary rows; Ollama local preferred |
| Model weight hosting | Internal artifact store only; never public HF upload of customer-tuned adapters |
| Evidence claims | Must map to input predicates (evaluator) |

## Policy engine placement

Hard policy lives in the **evaluator** (and later in a serving guard). The model is trained to comply; the evaluator is source of truth for ship/no-ship.

Rule IDs: see `evaluation_spec.md` (`POL-*`).

## Serving topology (target)

| Env | Runtime |
|---|---|
| Dev laptop | Ollama + base model |
| Training box | CUDA GPU, QLoRA, Unsloth/PEFT |
| Internal pilot | Same-VPC inference; no egress of payloads |

## Extension points

- Replace synthetic fixtures with Peak V3 export when approved
- Add credit metering (`ACTION_CREDITS` pattern from FinDataGraph shared package)
- Register agent manifest for Spec Studio / Marketplace
