# Technical Spec — Collections Recommendation Specialist

## Dataset schema (JSONL, one object per line)

```json
{
  "id": "rec_0001",
  "organization_id": "org_01",
  "customer": {
    "id": "cust_01",
    "name": "ACME_PSEUD",
    "risk_score": 82.0,
    "health": "at_risk",
    "strategic_account": true,
    "last_contact_at": null
  },
  "invoices": [
    {
      "invoice_number": "INV_P_1021",
      "days_past_due": 120,
      "open_balance": 180000.0,
      "dispute_flag": false,
      "promise_to_pay_date": null
    }
  ],
  "collector_context": {
    "assigned_collector": "col_jane",
    "availability": "available",
    "skill": "dispute"
  },
  "policy_flags": ["dispute_specialist_required", "no_split_customer"],
  "instruction": "…",
  "expected_action": "Route to dispute specialist",
  "expected_reason": "…",
  "expected_confidence": 0.86,
  "expected_evidence": ["risk_score>=80", "INV_P_1044.dispute_flag==true"],
  "metadata": {
    "created_at": "2026-10-12",
    "source_file_or_query": "synthetic_gold_v0",
    "split": "train"
  }
}
```

### Field constraints

| Field | Constraint |
|---|---|
| `customer.health` | `healthy` \| `watch` \| `at_risk` \| `critical` |
| `collector_context.availability` | `available` \| `pto` \| `unavailable` |
| `collector_context.skill` | `automation` \| `standard` \| `dispute` \| `strategic` |
| `expected_confidence` | `0.0`–`1.0` |
| `metadata.split` | `train` \| `holdout` |

## Pseudonymization

| Original | Transform |
|---|---|
| Org / customer / collector IDs | Stable hash → `org_XX`, `cust_XX`, `col_*` |
| Customer names | Uppercase token + `_PSEUD` |
| Invoice numbers | `INV_P_*` prefix; never real ERP numbers in gold |
| Emails | Dropped (never emitted) |

Mapping tables, if needed, stay in **internal** artifacts only (`data/collections_specialist/internal/` — gitignored).

## Split strategy

- Prefer **org-based** holdout: entire `organization_id` values reserved for eval
- Secondary: `metadata.split=holdout` flags on ≥10 examples
- Training scripts must filter `split != holdout`

## Model I/O contract

**System prompt** (see `prompts/collections_prompts.md`): strict JSON-only assistant.

**User message**: JSON of input fields only (no `expected_*`).

**Assistant message**:

```json
{
  "action": "Call AP contact",
  "reason": "…",
  "confidence": 0.7,
  "evidence": ["open_ar>=10000", "risk_score>=60"]
}
```

## Training defaults

| Knob | Default |
|---|---|
| Base model | Qwen2.5-Coder 7B |
| Method | QLoRA / LoRA via Unsloth or PEFT |
| `lora_r` | 16–32 (`alpha = 2*r`) |
| LR | `1e-4` |
| Epochs | 1–3 |
| Context | 2048 |
| Masking | Assistant-only |
| Validate | Every 500–1000 steps on holdout |

Commands: `scripts/train_lora_example.sh`.

## Environment assumptions

- Python 3.10+
- Optional: Ollama installed for baseline
- Optional: CUDA GPU for LoRA (document VRAM ≥16GB for 7B QLoRA)
- Repo-local paths only; no public dataset push

## Dataset builder I/O

```bash
python scripts/build_collections_dataset.py \
  --source data/collections_specialist/fixtures/raw_cases.json \
  --out data/collections_specialist/examples.jsonl \
  --seed 42
```

If `--source` omitted, builder regenerates the curated gold set (canonical Week 0 examples).

## Evaluator I/O

```bash
python scripts/evaluate_collections_recommendations.py \
  --examples data/collections_specialist/examples.jsonl \
  --predictions artifacts/collections_eval/baseline_predictions.jsonl \
  --out artifacts/collections_eval/baseline_metrics.json
```

## Unit tests

`tests/collections_specialist/test_evaluator.py` — synthetic model outputs covering pass/fail for `POL-*` rules.
