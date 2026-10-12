# Ollama — Collections Recommendation Specialist

Local baseline validation for the collections specialist. **Do not** send proprietary (non-pseudonymized) payloads to hosted model APIs.

## Prerequisites

- [Ollama](https://ollama.com) installed
- Python 3.10+
- Gold dataset at `data/collections_specialist/examples.jsonl`

## Pull base model

```bash
ollama pull qwen2.5-coder:7b
```

Optional alternate (needs more VRAM / disk):

```bash
# ollama pull <qwen3-coder-8b-tag-when-available>
```

## One-shot prompt file

Create a prompt JSON for a single holdout case:

```bash
python - <<'PY'
import json
from pathlib import Path
rows = [json.loads(l) for l in Path("data/collections_specialist/examples.jsonl").read_text().splitlines() if l.strip()]
ex = next(r for r in rows if r["id"] == "rec_0016")
payload = {
    "id": ex["id"],
    "organization_id": ex["organization_id"],
    "customer": ex["customer"],
    "invoices": ex["invoices"],
    "collector_context": ex["collector_context"],
    "policy_flags": ex["policy_flags"],
    "instruction": ex["instruction"],
}
Path("artifacts/collections_eval/prompt_rec_0016.json").parent.mkdir(parents=True, exist_ok=True)
Path("artifacts/collections_eval/prompt_rec_0016.txt").write_text(
    "You are a strict collections recommendation assistant. Use only facts in the provided JSON input. "
    "Output a single JSON object with keys: action, reason, confidence (0-1), evidence (list of strings). "
    "Do not invent facts.\n\nINPUT:\n" + json.dumps(payload, indent=2)
)
print("wrote artifacts/collections_eval/prompt_rec_0016.txt")
PY

ollama run qwen2.5-coder:7b < artifacts/collections_eval/prompt_rec_0016.txt
```

## Full holdout comparison

Prefer the orchestrator (falls back to heuristic baseline if Ollama is down):

```bash
python scripts/build_collections_dataset.py
python scripts/run_local_eval.py --force-heuristic   # CI / no GPU
python scripts/run_local_eval.py                     # uses Ollama when available
```

Artifacts land in `artifacts/collections_eval/`:

| File | Purpose |
|---|---|
| `baseline_predictions.jsonl` | Model outputs |
| `baseline_metrics.json` / `.csv` | Scores |
| `comparison.json` | Baseline vs adapter |
| `summary.md` | Short human summary |

## Serving parameters

See `configs/collections_specialist_config.yaml` → `serving` (`temperature: 0`, `max_tokens: 512`).

## Fine-tuned adapter

Adapters stay **local** under `models/collections-lora/`. After training:

```bash
python scripts/run_local_eval.py --adapter-dir models/collections-lora
```

Until a local PEFT server is wired, the runner documents adapter absence and uses the heuristic fallback for CI.

## Privacy checklist

- [ ] Inputs are pseudonymized (`*_PSEUD`, `INV_P_*`)
- [ ] No production emails / ERP IDs in prompts
- [ ] Ollama host is localhost / private network only
- [ ] Weights and datasets not uploaded to public model hubs
