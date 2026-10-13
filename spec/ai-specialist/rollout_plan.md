# Rollout Plan — Collections Recommendation Specialist

## Phases

### Week 0 — Scaffold

- [x] Spec pack under `spec/ai-specialist/`
- [x] 25 gold examples (≥10 holdout)
- [x] Dataset builder + evaluator + local eval runner
- [x] Config, prompts, LoRA starter, Ollama README
- [x] SME review packet authored (`baseline_sme_review.md`) — async checkbox may remain open

### Week 1 — Baseline (**complete**)

- [x] Install Ollama; pull `qwen2.5-coder:7b`
- [x] Run `python scripts/run_local_eval.py` on holdout
- [x] Lock metrics in `spec/ai-specialist/week1_baseline_report.md`
- [x] Prompt / synonym / evaluator hardening from failure notes (PR #8)
- [x] Dry-run `scripts/train_lora_example.sh` (15 train chats prepared; no weight publish)
- [x] Collections SME formal checkbox sign-off *(CJ confirmed holdout labels 2026-10-12)*

**Locked baseline:** action 0.60 · policy 1.00 · grounded 0.80 · halluc 0.20 · p50 ~9.2s

### Week 2 — LoRA pilot

**If no local NVIDIA GPU:** use Colab — `docs/ai-serving/COLAB_README.md` + `notebooks/collections_lora_colab.ipynb`.

1. Prepare train split: `python scripts/prepare_lora_train.py` (15 chats; no holdout)
2. Train QLoRA on Colab (or local CUDA) with `train_only.jsonl` / repo clone
3. Score holdout in Colab → `colab_holdout_metrics.json` (authoritative Week 2 numbers)
4. Download adapter bundle into `models/collections-lora/`
5. Compare vs Week 1 lock; require hallucination &lt; 5% and policy_pass ≥ 0.95
6. Collections SME sign-off on remaining failure cases
7. Publish Week 2 comparison report under `spec/ai-specialist/`

Priority miss classes: parent-child, PTP hold, manager escalate, mid-dollar email vs call.

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
- GPU box for Week 2 training (document VRAM; QLoRA ≥16GB recommended)
- CI runs evaluator unit tests on every PR touching `scripts/evaluate_*` or gold JSONL
