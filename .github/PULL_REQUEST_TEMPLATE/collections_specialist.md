## Collections Recommendation Specialist PR

### What changed

- [ ] Specs (`spec/ai-specialist/*`)
- [ ] Gold data (`data/collections_specialist/examples.jsonl`)
- [ ] Scripts / evaluator / config / prompts
- [ ] Other:

### Privacy & lineage

- [ ] No real PII / ERP IDs in the diff
- [ ] Pseudonymization documented (`data/README.md`)
- [ ] Dataset version noted in `configs/collections_specialist_config.yaml` if data changed

### Validation

```bash
python scripts/build_collections_dataset.py --validate-only
python -m unittest tests/collections_specialist/test_evaluator.py
python scripts/run_local_eval.py --force-heuristic
```

- [ ] Commands above pass
- [ ] Holdout metrics attached or summarized
- [ ] Hallucination rate &lt; 5% (or explained regression)

### SME

- [ ] Collections SME reviewed new/changed gold examples
- [ ] `evaluation_spec.md` rule IDs still accurate

### Checklist

- [ ] Does **not** push weights/datasets to public services
- [ ] Holdout examples not leaked into training prompts
