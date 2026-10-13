#!/usr/bin/env python3
"""Prepare train-only chat JSONL for LoRA (Windows-friendly; no bash required).

Usage:
  python scripts/prepare_lora_train.py
  python scripts/prepare_lora_train.py --data data/collections_specialist/examples.jsonl --out models/collections-lora

Does not download weights or train — only emits train_only.jsonl (excludes holdout).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SYSTEM_CONTENT = (
    "You are a strict collections recommendation assistant. Use only facts "
    "in the provided JSON input. Output a single JSON object with keys: "
    "action, reason, confidence (0-1), evidence (list of strings). "
    "Do not invent facts. JSON only, no markdown. "
    "action must be one of: Route to dispute specialist | Send automated reminder | "
    "Call AP contact | Email payment reminder | Escalate to manager | "
    "Hold — await promise-to-pay | Reassign to available collector | "
    "Keep parent-child grouping. "
    "If collector availability is pto/unavailable, action must be "
    "Reassign to available collector."
)


def build_train_rows(src: Path) -> list[dict]:
    rows: list[dict] = []
    for line in src.read_text(encoding="utf-8").splitlines():
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
                    {"role": "system", "content": SYSTEM_CONTENT},
                    {
                        "role": "user",
                        "content": "INPUT:\n" + json.dumps(inp, ensure_ascii=False),
                    },
                    {"role": "assistant", "content": json.dumps(out, ensure_ascii=False)},
                ],
            }
        )
    return rows


def print_training_hints(
    *,
    train_jsonl: Path,
    output_dir: Path,
    base_model: str,
    lora_r: int,
    lora_alpha: int,
    lr: str,
    epochs: int,
    batch_size: int,
    context_length: int,
    backend: str,
) -> None:
    print("\n== Next: train on a CUDA machine (do not upload weights publicly) ==")
    print(f"train_jsonl: {train_jsonl}")
    print(f"output_dir:  {output_dir}")
    print(f"base_model:  {base_model}")
    if backend == "unsloth":
        print(
            f"""
# Unsloth (example — install unsloth in your training venv first):
# max_seq_length={context_length}, r={lora_r}, alpha={lora_alpha}, lr={lr}, epochs={epochs}, batch={batch_size}
# Load {train_jsonl} in SFTTrainer with assistant-only masking; save to {output_dir}
"""
        )
    elif backend == "peft":
        print(
            f"# PEFT/TRL: SFTTrainer on {train_jsonl} -> save_pretrained({output_dir})\n"
        )
    else:
        print(f"# backend={backend}: use your cluster recipe with {train_jsonl}\n")
    print(f"After training: python scripts/run_local_eval.py --adapter-dir {output_dir}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(os.environ.get("DATA_PATH", REPO_ROOT / "data/collections_specialist/examples.jsonl")),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(os.environ.get("OUTPUT_DIR", REPO_ROOT / "models/collections-lora")),
    )
    parser.add_argument("--base-model", default=os.environ.get("BASE_MODEL_PATH", "Qwen/Qwen2.5-Coder-7B-Instruct"))
    parser.add_argument("--lora-r", type=int, default=int(os.environ.get("LORA_R", "32")))
    parser.add_argument("--lora-alpha", type=int, default=int(os.environ.get("LORA_ALPHA", "64")))
    parser.add_argument("--learning-rate", default=os.environ.get("LEARNING_RATE", "1e-4"))
    parser.add_argument("--epochs", type=int, default=int(os.environ.get("EPOCHS", "2")))
    parser.add_argument("--batch-size", type=int, default=int(os.environ.get("BATCH_SIZE", "8")))
    parser.add_argument("--context-length", type=int, default=int(os.environ.get("CONTEXT_LENGTH", "2048")))
    parser.add_argument("--backend", default=os.environ.get("TRAIN_BACKEND", "unsloth"))
    args = parser.parse_args(argv)

    if not args.data.is_file():
        print(f"Missing dataset: {args.data}", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    train_jsonl = args.out / "train_only.jsonl"
    rows = build_train_rows(args.data)
    if not rows:
        print("No train rows (check metadata.split)", file=sys.stderr)
        return 1

    holdout_ids = set()
    for line in args.data.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            if (r.get("metadata") or {}).get("split") == "holdout":
                holdout_ids.add(r["id"])
    written_ids = {r["id"] for r in rows}
    if holdout_ids & written_ids:
        print("ERROR: holdout leaked into train file", file=sys.stderr)
        return 1

    train_jsonl.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "wrote": str(train_jsonl),
                "train_chats": len(rows),
                "ids": [r["id"] for r in rows],
                "holdout_excluded": sorted(holdout_ids),
            },
            indent=2,
        )
    )
    print_training_hints(
        train_jsonl=train_jsonl,
        output_dir=args.out,
        base_model=args.base_model,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lr=args.learning_rate,
        epochs=args.epochs,
        batch_size=args.batch_size,
        context_length=args.context_length,
        backend=args.backend,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
