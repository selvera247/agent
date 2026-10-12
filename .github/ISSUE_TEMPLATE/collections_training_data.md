---
name: Collections training data
about: Propose new gold examples for the Collections Recommendation Specialist
title: "[collections-data] "
labels: ["ai-specialist", "datasets"]
---

## Summary

What scenarios are you adding or correcting?

## Privacy

- [ ] Rows are **pseudonymized** (no emails, real invoice numbers, or collector PII)
- [ ] Ran / will run `scripts/build_collections_dataset.py` before commit
- [ ] No proprietary extract attached to this public issue

## Split

- [ ] New eval cases marked `metadata.split=holdout` (and preferably dedicated org)
- [ ] Training cases marked `metadata.split=train`
- [ ] Holdout IDs are **not** used in few-shot prompts

## Versioning

- Dataset version bump (config `dataset.version`):
- `metadata.source_file_or_query`:

## Evaluation impact

- [ ] Re-ran `python scripts/run_local_eval.py --force-heuristic`
- [ ] Attached metric delta (`artifacts/collections_eval/summary.md`)

## SME review

- [ ] Collections SME reviewed expected_action / evidence
