# Collections specialist data

## Lineage

| Version | Source | Notes |
|---|---|---|
| `synthetic_gold_v0` | Curated synthetic cases (Week 0) | Pseudonymized; safe for repo |
| Future Peak V3 export | Internal read-only extract (approval required) | Must run through `scripts/build_collections_dataset.py` |

**Never** commit real customer emails, ERP invoice numbers, or collector PII.  
**Never** push datasets or fine-tuned weights to public services.

## Pseudonymization steps

1. Map org/customer/collector IDs → stable salted hashes (`org_*`, `cust_*`, `col_*`)
2. Replace customer names with `TOKEN_PSEUD`
3. Rewrite invoice numbers to `INV_P_*`
4. Drop email / phone / address fields
5. Emit JSONL schema documented in `spec/ai-specialist/technical_spec.md`

Internal ID maps (if any) belong under `data/collections_specialist/internal/` (gitignored).

## Split

- `metadata.split=train` — usable for LoRA / few-shot authoring
- `metadata.split=holdout` — eval only (≥10 examples in v0)
- Prefer org-based holdout (`org_99` reserved in gold set)

## Regenerating gold JSONL

```bash
python scripts/build_collections_dataset.py \
  --out data/collections_specialist/examples.jsonl \
  --seed 42
```

## Schema validation

The builder validates required keys and types before write. The evaluator refuses rows missing `expected_*` fields.
