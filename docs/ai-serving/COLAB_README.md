# Google Colab — Week 2 LoRA for Collections Specialist

Use this when your PC has **no NVIDIA GPU** (e.g. AMD-only desktop). Train QLoRA in Colab, download the adapter, then score locally.

## Privacy

- Upload / clone **only** the repo’s **pseudonymized** gold data (`examples.jsonl` / `train_only.jsonl`).
- **Do not** upload real customer AR, emails, or ERP IDs.
- Do not publish the fine-tuned adapter to a public model hub.

## What you need

1. Google account + [Google Colab](https://colab.research.google.com/)
2. GPU runtime (**Runtime → Change runtime type → T4 or better**)
3. This notebook: [`notebooks/collections_lora_colab.ipynb`](../../notebooks/collections_lora_colab.ipynb)

## Steps (Windows)

### A. On your PC (optional but useful)

```powershell
cd C:\Users\Selvera\agent
git pull
python scripts\prepare_lora_train.py
```

Confirm `models\collections-lora\train_only.jsonl` exists (15 lines).

### B. In Colab

1. Open Colab → **File → Upload notebook** → choose `notebooks/collections_lora_colab.ipynb`  
   (or open from GitHub after this PR merges: `selvera247/agent`)
2. **Runtime → Change runtime type → GPU** (T4 is enough for 15 examples)
3. **Runtime → Run all**
4. When prompted, either:
   - let the notebook `git clone` the public repo, **or**
   - upload `train_only.jsonl` + `examples.jsonl` via the upload cell
5. Wait for training (~10–40 min on T4 depending on queue)
6. Download `collections-lora-adapter.zip` from the last cell

### C. Back on your PC

```powershell
cd C:\Users\Selvera\agent
# unzip into models\collections-lora\  (adapter_config.json + adapter weights)
# also copy colab_holdout_metrics.json into artifacts\collections_eval\ if present

python scripts\run_local_eval.py --adapter-dir models\collections-lora
```

> Note: local `run_local_eval.py` still uses Ollama/heuristic for serving unless you wire transformers inference. The **authoritative Week 2 metrics** are the ones produced **inside Colab** (`colab_holdout_metrics.json`). Compare those to the Week 1 lock in `spec/ai-specialist/week1_baseline_report.md`.

## Week 1 lock (beat these)

| Metric | Week 1 baseline |
|---|---|
| action_match | 0.60 |
| policy_pass | 1.00 |
| groundedness | 0.80 |
| hallucination | 0.20 |

## Troubleshooting

| Issue | Fix |
|---|---|
| No GPU in Colab | Runtime → Change runtime type → GPU; free tier may need to retry |
| CUDA OOM | Lower `BATCH_SIZE` to 1–2, keep QLoRA 4-bit |
| Hub gated model | Use the public `Qwen/Qwen2.5-Coder-7B-Instruct` id in the notebook |
| Clone fails | Upload JSONL files manually in the upload cell |

## Related

- Local Ollama baseline: `docs/ai-serving/OLLAMA_README.md`
- Train prep (no bash): `python scripts/prepare_lora_train.py`
- Config defaults: `configs/collections_specialist_config.yaml`
