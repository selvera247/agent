#!/usr/bin/env bash
# Reproducible LoRA/QLoRA starter for the Collections Recommendation Specialist.
# Parameterize paths/GPU. Do NOT push adapters or datasets to public registries.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- placeholders (override via env) ---
BASE_MODEL_PATH="${BASE_MODEL_PATH:-Qwen/Qwen2.5-Coder-7B-Instruct}"
DATA_PATH="${DATA_PATH:-$ROOT/data/collections_specialist/examples.jsonl}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT/models/collections-lora}"
LORA_R="${LORA_R:-32}"
LORA_ALPHA="${LORA_ALPHA:-64}"
LEARNING_RATE="${LEARNING_RATE:-1e-4}"
EPOCHS="${EPOCHS:-2}"
BATCH_SIZE="${BATCH_SIZE:-8}"
CONTEXT_LENGTH="${CONTEXT_LENGTH:-2048}"
CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"
TRAIN_BACKEND="${TRAIN_BACKEND:-unsloth}"  # unsloth | peft | axolotl

export CUDA_VISIBLE_DEVICES
export DATA_PATH OUTPUT_DIR

mkdir -p "$OUTPUT_DIR"

echo "== Collections LoRA train =="
echo "backend=$TRAIN_BACKEND base=$BASE_MODEL_PATH data=$DATA_PATH out=$OUTPUT_DIR"

# Filter to train split only (holdout must not leak) → chat JSONL for SFT
TRAIN_JSONL="$OUTPUT_DIR/train_only.jsonl"
python3 - "$DATA_PATH" "$TRAIN_JSONL" <<'PY'
import json, sys
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
rows = []
for line in src.read_text().splitlines():
    if not line.strip():
        continue
    row = json.loads(line)
    if (row.get("metadata") or {}).get("split") == "holdout":
        continue
    inp = {
        "id": row["id"],
        "organization_id": row["organization_id"],
        "customer": row["customer"],
        "invoices": row["invoices"],
        "collector_context": row["collector_context"],
        "policy_flags": row["policy_flags"],
        "instruction": row["instruction"],
    }
    out = {
        "action": row["expected_action"],
        "reason": row["expected_reason"],
        "confidence": row["expected_confidence"],
        "evidence": row["expected_evidence"],
    }
    rows.append(
        {
            "id": row["id"],
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a strict collections recommendation assistant. Use only facts "
                        "in the provided JSON input. Output a single JSON object with keys: "
                        "action, reason, confidence (0-1), evidence (list of strings). "
                        "Do not invent facts. Keep reason concise and cite evidence."
                    ),
                },
                {
                    "role": "user",
                    "content": "INPUT:\n" + json.dumps(inp, ensure_ascii=False),
                },
                {"role": "assistant", "content": json.dumps(out, ensure_ascii=False)},
            ],
        }
    )
dst.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
print(f"wrote {len(rows)} train chats -> {dst}")
PY

case "$TRAIN_BACKEND" in
  unsloth)
    cat <<EOF
# Example Unsloth command (install unsloth in your training env first):
python - <<'PY'
from unsloth import FastLanguageModel
# max_seq_length=${CONTEXT_LENGTH}
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="${BASE_MODEL_PATH}",
    max_seq_length=${CONTEXT_LENGTH},
    load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model,
    r=${LORA_R},
    lora_alpha=${LORA_ALPHA},
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
    lora_dropout=0.05,
)
# Wire SFTTrainer on ${TRAIN_JSONL} with assistant-only masking, lr=${LEARNING_RATE},
# epochs=${EPOCHS}, batch=${BATCH_SIZE}, eval every 500 steps on holdout.
# model.save_pretrained("${OUTPUT_DIR}")
print("Fill SFTTrainer body for your cluster image; paths are parameterized above.")
PY
EOF
    ;;
  peft)
    cat <<EOF
# Hugging Face PEFT / TRL example:
# python train_lora.py \\
#   --base-model ${BASE_MODEL_PATH} \\
#   --data ${TRAIN_JSONL} \\
#   --output-dir ${OUTPUT_DIR} \\
#   --lora-r ${LORA_R} \\
#   --learning-rate ${LEARNING_RATE} \\
#   --epochs ${EPOCHS} \\
#   --batch-size ${BATCH_SIZE} \\
#   --context-length ${CONTEXT_LENGTH}
echo "PEFT entrypoint not bundled; use TRL SFTTrainer against ${TRAIN_JSONL}"
EOF
    ;;
  axolotl)
    cat <<EOF
# Axolotl: point a yml at base model + ${TRAIN_JSONL}, lora_r=${LORA_R}, lr=${LEARNING_RATE}
# accelerate launch -m axolotl.cli.train configs/collections_axolotl.yml
echo "Provide Axolotl yml in training env; dataset prepared at ${TRAIN_JSONL}"
EOF
    ;;
  *)
    echo "Unknown TRAIN_BACKEND=$TRAIN_BACKEND" >&2
    exit 1
    ;;
esac

echo "Prepared train-only chat JSONL at $TRAIN_JSONL"
echo "After training, run: python scripts/run_local_eval.py --adapter-dir $OUTPUT_DIR"
