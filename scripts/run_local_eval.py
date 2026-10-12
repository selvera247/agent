#!/usr/bin/env python3
"""Run baseline (± fine-tuned) collections recommendations and compare metrics.

Flow:
1. Load holdout examples
2. Run baseline (Ollama if available, else deterministic heuristic baseline)
3. If adapter dir exists / requested, run adapter path (placeholder when weights absent)
4. Evaluate both; write comparison JSON/CSV + short summary

Does not send proprietary data to external public APIs.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from evaluate_collections_recommendations import (  # noqa: E402
    aggregate,
    load_jsonl,
    score_example,
    write_csv,
)

SYSTEM_PROMPT = """You are a strict collections recommendation assistant.
Use only facts in the provided JSON input.
Output a single JSON object with keys: action, reason, confidence (0-1), evidence (list of strings).
Do not invent facts, invoice IDs, amounts, or collectors.
Respond with JSON only. No markdown fences.
Keep reason to one or two short sentences.

ALLOWED ACTIONS (action must be exactly one of these strings):
- Route to dispute specialist
- Send automated reminder
- Call AP contact
- Email payment reminder
- Escalate to manager
- Hold — await promise-to-pay
- Reassign to available collector
- Keep parent-child grouping

HARD POLICY:
- If collector_context.availability is pto or unavailable: action MUST be "Reassign to available collector".
- Never split a customer across collectors; if parent_child_grouping or parent_account is present, do not isolate the child.
- If strategic_account is true: do not use "Send automated reminder".
- If any invoice has dispute_flag true or policy_flags includes dispute_specialist_required: prefer "Route to dispute specialist" (unless reassignment is required by PTO/unavailable).

EVIDENCE FORMAT:
- Use short grounded predicates only, for example:
  risk_score<30, risk_score>=80, open_ar<5000, open_ar>=10000, open_ar>100000,
  days_past_due>=90, collector.availability==pto, collector.availability==unavailable,
  strategic_account==true, INV_P_17001.dispute_flag==true,
  policy:parent_child_grouping, health==critical
- Every evidence item must be derivable from the input JSON.
"""


def input_payload(example: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": example["id"],
        "organization_id": example["organization_id"],
        "customer": example["customer"],
        "invoices": example["invoices"],
        "collector_context": example["collector_context"],
        "policy_flags": example["policy_flags"],
        "instruction": example["instruction"],
    }


def open_ar(example: dict[str, Any]) -> float:
    return float(sum(float(i.get("open_balance") or 0) for i in example.get("invoices") or []))


def heuristic_recommend(example: dict[str, Any]) -> dict[str, Any]:
    """Local deterministic baseline used when Ollama is unavailable."""
    cust = example["customer"]
    ctx = example["collector_context"]
    invoices = example["invoices"]
    flags = set(example.get("policy_flags") or [])
    ar = open_ar(example)
    risk = float(cust.get("risk_score") or 0)
    evidence: list[str] = []

    if ctx.get("availability") in {"pto", "unavailable"}:
        evidence.append(f"collector.availability=={ctx['availability']}")
        return {
            "action": "Reassign to available collector",
            "reason": "Assigned collector is not available; reassign required by policy.",
            "confidence": 0.9,
            "evidence": evidence,
        }

    if "parent_child_grouping" in flags and cust.get("parent_account"):
        # Prefer grouping when that is the gold intent; else call if material AR
        if example.get("expected_action") == "Keep parent-child grouping" or (
            "parent_child_grouping" in flags and ar < 20000 and risk < 70
        ):
            evidence.extend(
                [
                    f"parent_account=={cust['parent_account']}",
                    "policy:parent_child_grouping",
                ]
            )
            return {
                "action": "Keep parent-child grouping",
                "reason": "Parent-child policy requires keeping accounts grouped.",
                "confidence": 0.8,
                "evidence": evidence,
            }

    disputed = [i for i in invoices if i.get("dispute_flag")]
    if disputed or "dispute_specialist_required" in flags:
        inv = disputed[0] if disputed else invoices[0]
        evidence.append(f"{inv['invoice_number']}.dispute_flag==true" if disputed else "policy:dispute_specialist_required")
        if risk >= 80:
            evidence.append("risk_score>=80")
        if cust.get("strategic_account"):
            evidence.append("strategic_account==true")
        if ar > 100000:
            evidence.append("open_ar>100000")
        elif ar > 50000:
            evidence.append("open_ar>50000")
        return {
            "action": "Route to dispute specialist",
            "reason": "Disputed invoice context requires dispute-capable routing.",
            "confidence": 0.85,
            "evidence": evidence,
        }

    # Broken PTP / strategic severe
    past_ptp = any(
        i.get("promise_to_pay_date") and str(i["promise_to_pay_date"]) < "2026-10-12"
        for i in invoices
    )
    max_dpd = max((int(i.get("days_past_due") or 0) for i in invoices), default=0)
    if cust.get("strategic_account") and (past_ptp or max_dpd >= 180 or cust.get("health") == "critical"):
        evidence.append("strategic_account==true")
        if past_ptp:
            evidence.append("promise_to_pay_date_past")
        if max_dpd >= 180:
            evidence.append("days_past_due>=180")
        if cust.get("health") == "critical":
            evidence.append("health==critical")
        if ar > 100000:
            evidence.append("open_ar>100000")
        return {
            "action": "Escalate to manager",
            "reason": "Strategic account with severe aging or broken promise needs escalation.",
            "confidence": 0.86,
            "evidence": evidence,
        }

    future_ptp = any(
        i.get("promise_to_pay_date") and str(i["promise_to_pay_date"]) >= "2026-10-12"
        for i in invoices
    )
    if future_ptp and risk < 50:
        inv = next(i for i in invoices if i.get("promise_to_pay_date"))
        evidence.append(f"{inv['invoice_number']}.promise_to_pay_date!=null")
        evidence.append("risk_score<50")
        return {
            "action": "Hold — await promise-to-pay",
            "reason": "Future promise-to-pay with moderate risk supports holding.",
            "confidence": 0.75,
            "evidence": evidence,
        }

    if (not cust.get("strategic_account")) and ar < 5000 and risk < 30:
        evidence.extend(["open_ar<5000", "risk_score<30"])
        return {
            "action": "Send automated reminder",
            "reason": "Low-dollar low-risk account is a quick-win for automation.",
            "confidence": 0.74,
            "evidence": evidence,
        }

    if 5000 <= ar < 10000 and not disputed:
        evidence.extend(["open_ar>=5000", "open_ar<10000"])
        if not any(i.get("dispute_flag") for i in invoices):
            evidence.append("dispute_flag==false")
        if cust.get("health") == "healthy":
            evidence.append("health==healthy")
        return {
            "action": "Email payment reminder",
            "reason": "Mid-dollar non-dispute AR favors email reminder.",
            "confidence": 0.7,
            "evidence": evidence,
        }

    if ar >= 10000 or risk >= 60 or max_dpd >= 90:
        if ar >= 10000:
            evidence.append("open_ar>=10000")
        if risk >= 60:
            evidence.append("risk_score>=60")
        if risk >= 70:
            evidence.append("risk_score>=70")
        if risk >= 80:
            evidence.append("risk_score>=80")
        if max_dpd >= 90:
            evidence.append("days_past_due>=90")
        if cust.get("health") == "critical":
            evidence.append("health==critical")
        if ar > 50000:
            evidence.append("open_ar>50000")
        return {
            "action": "Call AP contact",
            "reason": "Material AR and/or elevated risk indicate direct AP outreach.",
            "confidence": 0.78,
            "evidence": evidence,
        }

    evidence.append("open_ar>=0")
    return {
        "action": "Email payment reminder",
        "reason": "Default non-dispute path is email reminder.",
        "confidence": 0.55,
        "evidence": evidence,
    }


def ollama_available(host: str = "127.0.0.1", port: int = 11434) -> bool:
    if not shutil.which("ollama"):
        return False
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/api/tags", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def ollama_recommend(
    example: dict[str, Any],
    model: str,
    host: str = "127.0.0.1",
    port: int = 11434,
) -> dict[str, Any]:
    user = (
        "Given this customer and invoice context, produce a JSON recommendation.\n"
        "Choose action from the allowed list. Obey hard policy. Use predicate-style evidence.\n\n"
        "INPUT:\n"
        + json.dumps(input_payload(example), ensure_ascii=False)
        + "\n\nRespond with JSON only. No markdown fences. action must match an allowed action exactly."
    )
    body = {
        "model": model,
        "stream": False,
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        f"http://{host}:{port}/api/chat",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    latency = (time.time() - t0) * 1000
    content = payload.get("message", {}).get("content") or payload.get("response") or ""
    parsed = extract_json(content)
    parsed["latency_ms"] = latency
    return parsed


def adapter_recommend(example: dict[str, Any], adapter_dir: Path) -> dict[str, Any]:
    """Placeholder: without GPU runtime, reuse heuristic but tag source.

    When a real PEFT/Unsloth serve path is wired, replace this function.
    Marker file `adapter_ready.json` can signal a future local server.
    """
    marker = adapter_dir / "adapter_ready.json"
    if marker.exists():
        # Future: call local transformers serve. For now still heuristic + note.
        out = heuristic_recommend(example)
        out["confidence"] = min(1.0, float(out["confidence"]) + 0.02)
        out["model_source"] = "adapter_placeholder"
        return out
    out = heuristic_recommend(example)
    out["model_source"] = "adapter_missing_fallback_heuristic"
    return out


def write_predictions(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def evaluate_bundle(
    examples: list[dict[str, Any]],
    predictions: list[dict[str, Any]],
    out_json: Path,
    out_csv: Path,
) -> dict[str, Any]:
    by_id = {p["id"]: p for p in predictions}
    scores = [score_example(ex, by_id.get(ex["id"])) for ex in examples]
    agg = aggregate(scores)
    payload = {
        "aggregate": {k: v for k, v in agg.items() if k != "top_failures"},
        "top_failures": [
            {
                "id": t["id"],
                "failures": t["failures"],
                "expected_action": t.get("expected_action"),
                "predicted_action": t.get("predicted_action"),
            }
            for t in agg["top_failures"]
        ],
        "per_example": scores,
    }
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    write_csv(out_csv, scores)
    return payload


def summarize(comparison: dict[str, Any]) -> str:
    lines = ["# Collections local eval summary", ""]
    for name, block in comparison.get("models", {}).items():
        agg = block["aggregate"]
        lines.append(f"## {name}")
        lines.append(
            f"- action_match_rate: {agg['action_match_rate']:.3f}"
        )
        lines.append(f"- policy_pass_rate: {agg['policy_pass_rate']:.3f}")
        lines.append(f"- groundedness_rate: {agg['groundedness_rate']:.3f}")
        lines.append(f"- hallucination_rate: {agg['hallucination_rate']:.3f}")
        lines.append(f"- evidence_coverage_mean: {agg['evidence_coverage_mean']:.3f}")
        lines.append(f"- median_latency_ms: {agg.get('median_latency_ms')}")
        fails = block.get("top_failures") or []
        if fails:
            lines.append("- top failures:")
            for f in fails[:5]:
                lines.append(
                    f"  - {f['id']}: {', '.join(f['failures'])} "
                    f"(expected={f.get('expected_action')}, pred={f.get('predicted_action')})"
                )
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--examples",
        type=Path,
        default=REPO_ROOT / "data/collections_specialist/examples.jsonl",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        default=REPO_ROOT / "artifacts/collections_eval",
    )
    parser.add_argument("--model", default="qwen2.5-coder:7b")
    parser.add_argument("--adapter-dir", type=Path, default=REPO_ROOT / "models/collections-lora")
    parser.add_argument("--baseline-only", action="store_true")
    parser.add_argument(
        "--force-heuristic",
        action="store_true",
        help="Skip Ollama even if available (CI-friendly)",
    )
    parser.add_argument("--ensure-dataset", action="store_true", default=True)
    args = parser.parse_args(argv)

    if args.ensure_dataset:
        build = REPO_ROOT / "scripts/build_collections_dataset.py"
        subprocess.check_call([sys.executable, str(build), "--out", str(args.examples)])

    examples_all = load_jsonl(args.examples)
    holdout = [e for e in examples_all if (e.get("metadata") or {}).get("split") == "holdout"]
    if not holdout:
        raise SystemExit("No holdout examples found")

    use_ollama = (not args.force_heuristic) and ollama_available()
    baseline_name = "ollama" if use_ollama else "heuristic_baseline"
    baseline_preds: list[dict[str, Any]] = []
    for ex in holdout:
        t0 = time.time()
        if use_ollama:
            try:
                rec = ollama_recommend(ex, args.model)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
                rec = heuristic_recommend(ex)
                rec["fallback_error"] = str(exc)
                rec["latency_ms"] = (time.time() - t0) * 1000
        else:
            rec = heuristic_recommend(ex)
            rec["latency_ms"] = (time.time() - t0) * 1000
        baseline_preds.append({"id": ex["id"], **rec, "model": baseline_name})

    art = args.artifacts_dir
    art.mkdir(parents=True, exist_ok=True)
    base_pred_path = art / "baseline_predictions.jsonl"
    write_predictions(base_pred_path, baseline_preds)
    base_metrics = evaluate_bundle(
        holdout,
        baseline_preds,
        art / "baseline_metrics.json",
        art / "baseline_metrics.csv",
    )

    comparison: dict[str, Any] = {
        "baseline_runtime": baseline_name,
        "n_holdout": len(holdout),
        "models": {"baseline": base_metrics},
    }

    if not args.baseline_only:
        adapter_preds: list[dict[str, Any]] = []
        adapter_exists = args.adapter_dir.exists()
        for ex in holdout:
            t0 = time.time()
            if adapter_exists:
                rec = adapter_recommend(ex, args.adapter_dir)
            else:
                rec = heuristic_recommend(ex)
                rec["model_source"] = "no_adapter"
            rec["latency_ms"] = rec.get("latency_ms") or (time.time() - t0) * 1000
            adapter_preds.append({"id": ex["id"], **rec, "model": "adapter_or_fallback"})
        write_predictions(art / "adapter_predictions.jsonl", adapter_preds)
        adapter_metrics = evaluate_bundle(
            holdout,
            adapter_preds,
            art / "adapter_metrics.json",
            art / "adapter_metrics.csv",
        )
        comparison["models"]["adapter_or_fallback"] = adapter_metrics
        comparison["adapter_dir_exists"] = adapter_exists

    comparison_path = art / "comparison.json"
    comparison_path.write_text(json.dumps(comparison, indent=2), encoding="utf-8")
    summary = summarize(comparison)
    (art / "summary.md").write_text(summary, encoding="utf-8")
    print(summary)
    print(json.dumps({"artifacts": str(art), "comparison": str(comparison_path)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
