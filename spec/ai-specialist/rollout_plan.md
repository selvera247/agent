# Rollout Plan — Collections Recommendation Specialist

## Phases

### Week 0 — Scaffold (this PR)

- [x] Spec pack under `spec/ai-specialist/`
- [x] 25 gold examples (≥10 holdout)
- [x] Dataset builder + evaluator + local eval runner
- [x] Config, prompts, LoRA starter, Ollama README
- [ ] SME review of gold set + evaluation rule map

### Week 1 — Baseline

1. Install Ollama; pull `qwen2.5-coder:7b`
2. `python scripts/run_local_eval.py --baseline-only`
3. Archive metrics under internal artifact store
4. Dry-run `scripts/train_lora_example.sh` with tiny subset (no weight publish)

### Week 2 — LoRA pilot

1. Train adapter on `split=train` only
2. Re-run `run_local_eval.py` with `--adapter-dir models/collections-lora`
3. Compare CSV/JSON; require hallucination &lt; 5% and policy_pass ≥ 0.95
4. Collections SME sign-off on failure case review

### Internal pilot (post Week 2)

- Shadow mode: log recommendations beside human actions (no write-back)
- Serving guard: same `POL-*` checks as evaluator before UI display
- Legal/privacy sign-off on lineage (`data/README.md`)

## Owners

| Workstream | Owner |
|---|---|
| Specs / acceptance | PM |
| Gold labels | Collections SME |
| Eval engineering | Agent eng |
| Training infra | ML eng |
| Privacy | Legal / security |

## Rollback

- Disable adapter; fall back to baseline or human-only
- Keep evaluator as CI check on gold set regressions

## Adding training data (process)

1. Open issue with `.github/ISSUE_TEMPLATE/collections_training_data.md`
2. Pseudonymize via builder; never commit raw PII
3. Bump dataset version in `metadata.source_file_or_query` / config `dataset.version`
4. Re-run holdout eval; PR must include metric delta

## Environment assumptions

- No egress of proprietary payloads to public model APIs
- GPU box for Week 2 training (document VRAM)
- CI runs evaluator unit tests on every PR touching `scripts/evaluate_*` or gold JSONL
