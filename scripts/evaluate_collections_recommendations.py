#!/usr/bin/env python3
"""Deterministic evaluator for collections recommendations.

Implements the rubric in spec/ai-specialist/evaluation_spec.md:
policy compliance, groundedness, action correctness, confidence calibration,
evidence coverage.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from pathlib import Path
from statistics import median
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]

ACTION_SYNONYMS: dict[str, set[str]] = {
    "route to dispute specialist": {
        "route to dispute specialist",
        "dispute specialist",
        "route dispute",
        "assign dispute collector",
    },
    "send automated reminder": {
        "send automated reminder",
        "auto reminder",
        "automation reminder",
        "send reminder (auto)",
    },
    "call ap contact": {
        "call ap contact",
        "call ap",
        "phone ap",
        "call customer ap",
    },
    "email payment reminder": {
        "email payment reminder",
        "email reminder",
        "send email reminder",
    },
    "escalate to manager": {
        "escalate to manager",
        "manager escalation",
        "escalate manager",
    },
    "hold — await promise-to-pay": {
        "hold — await promise-to-pay",
        "hold - await promise-to-pay",
        "hold for ptp",
        "await ptp",
        "wait on promise",
    },
    "reassign to available collector": {
        "reassign to available collector",
        "reassign collector",
        "reassign available",
    },
    "keep parent-child grouping": {
        "keep parent-child grouping",
        "maintain parent-child",
        "do not split child",
    },
}

SPLIT_KEYWORDS = (
    "split customer",
    "split the customer",
    "split across collectors",
    "different collectors per invoice",
    "assign invoices to separate collectors",
)
ISOLATE_KEYWORDS = (
    "isolate child",
    "separate ownership",
    "break parent-child",
    "ungroup child",
    "treat child separately",
)

REASSIGN_CANONICAL = "reassign to available collector"
AUTO_ACTIONS = {"send automated reminder"}


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def canonical_action(action: str) -> str | None:
    a = norm(action)
    for canon, syns in ACTION_SYNONYMS.items():
        if a == canon or a in syns:
            return canon
        for syn in syns:
            if syn in a or a in syn:
                return canon
    return None


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def input_numbers(example: dict[str, Any]) -> set[str]:
    nums: set[str] = set()
    cust = example.get("customer") or {}
    if cust.get("risk_score") is not None:
        nums.add(str(cust["risk_score"]))
        nums.add(str(int(float(cust["risk_score"]))))
    for inv in example.get("invoices") or []:
        for key in ("open_balance", "days_past_due"):
            if inv.get(key) is not None:
                nums.add(str(inv[key]))
                try:
                    nums.add(str(int(float(inv[key]))))
                except (TypeError, ValueError):
                    pass
    total = sum(float(i.get("open_balance") or 0) for i in example.get("invoices") or [])
    nums.add(str(total))
    nums.add(str(int(total)))
    return nums


def input_ids(example: dict[str, Any]) -> set[str]:
    ids = set()
    cust = example.get("customer") or {}
    for k in ("id", "name", "parent_account"):
        if cust.get(k):
            ids.add(str(cust[k]))
    for inv in example.get("invoices") or []:
        if inv.get("invoice_number"):
            ids.add(str(inv["invoice_number"]))
    ctx = example.get("collector_context") or {}
    if ctx.get("assigned_collector"):
        ids.add(str(ctx["assigned_collector"]))
    return ids


def derived_predicates(example: dict[str, Any]) -> set[str]:
    """Facts the model may cite; mirrors expected_evidence style."""
    preds: set[str] = set()
    cust = example.get("customer") or {}
    invoices = example.get("invoices") or []
    ctx = example.get("collector_context") or {}
    flags = example.get("policy_flags") or []
    risk = float(cust.get("risk_score") or 0)
    ar = sum(float(i.get("open_balance") or 0) for i in invoices)
    max_dpd = max((int(i.get("days_past_due") or 0) for i in invoices), default=0)

    for thr in (30, 50, 60, 70, 80):
        if risk >= thr:
            preds.add(f"risk_score>={thr}")
        if risk < thr:
            preds.add(f"risk_score<{thr}")
    for thr in (1000, 5000, 10000, 50000, 100000):
        if ar >= thr:
            preds.add(f"open_ar>={thr}")
        if ar > thr:
            preds.add(f"open_ar>{thr}")
        if ar < thr:
            preds.add(f"open_ar<{thr}")
    for thr in (90, 180):
        if max_dpd >= thr:
            preds.add(f"days_past_due>={thr}")

    health = cust.get("health")
    if health:
        preds.add(f"health=={health}")
    if cust.get("strategic_account"):
        preds.add("strategic_account==true")
    if cust.get("parent_account"):
        preds.add(f"parent_account=={cust['parent_account']}")

    any_dispute = False
    for inv in invoices:
        num = inv.get("invoice_number")
        if inv.get("dispute_flag"):
            any_dispute = True
            preds.add(f"{num}.dispute_flag==true")
        if inv.get("promise_to_pay_date"):
            preds.add(f"{num}.promise_to_pay_date!=null")
            # past PTP heuristic: date string < 2026-10-12
            ptp = str(inv["promise_to_pay_date"])
            if ptp < "2026-10-12":
                preds.add("promise_to_pay_date_past")
    if not any_dispute:
        preds.add("dispute_flag==false")

    avail = ctx.get("availability")
    if avail:
        preds.add(f"collector.availability=={avail}")
    for flag in flags:
        preds.add(f"policy:{flag}")
        preds.add(flag)
    return {norm(p) for p in preds}


def normalize_evidence_item(item: str) -> str:
    return norm(item).replace(" ", "")


def check_policy(example: dict[str, Any], pred: dict[str, Any]) -> tuple[bool, list[str]]:
    failures: list[str] = []
    action = norm(str(pred.get("action") or ""))
    reason = norm(str(pred.get("reason") or ""))
    blob = f"{action} {reason}"
    canon = canonical_action(str(pred.get("action") or ""))
    ctx = example.get("collector_context") or {}
    cust = example.get("customer") or {}
    flags = set(example.get("policy_flags") or [])
    invoices = example.get("invoices") or []

    # POL-PTO-01
    if ctx.get("availability") in {"pto", "unavailable"}:
        if canon != REASSIGN_CANONICAL:
            failures.append("POL-PTO-01")

    # POL-SPLIT-01
    if "no_split_customer" in flags or "parent_child_grouping" in flags or cust.get("parent_account"):
        if any(k in blob for k in SPLIT_KEYWORDS):
            failures.append("POL-SPLIT-01")

    # POL-STRAT-01
    if cust.get("strategic_account") and canon in AUTO_ACTIONS:
        failures.append("POL-STRAT-01")

    # POL-DISPUTE-01 — dispute context cannot be handled via automation-only path
    has_dispute = any(i.get("dispute_flag") for i in invoices) or (
        "dispute_specialist_required" in flags
    )
    dispute_allowed = {
        "route to dispute specialist",
        REASSIGN_CANONICAL,
        "escalate to manager",
        "keep parent-child grouping",
        "hold — await promise-to-pay",
    }
    if has_dispute and canon is not None:
        if canon in AUTO_ACTIONS or (
            "dispute_specialist_required" in flags
            and canon not in dispute_allowed
            and "dispute" not in action
        ):
            failures.append("POL-DISPUTE-01")

    # POL-GROUP-01
    if "parent_child_grouping" in flags or cust.get("parent_account"):
        if any(k in blob for k in ISOLATE_KEYWORDS):
            failures.append("POL-GROUP-01")

    return (len(failures) == 0), failures


def check_groundedness(
    example: dict[str, Any], pred: dict[str, Any]
) -> tuple[bool, bool, list[str]]:
    """Returns grounded, hallucinated, notes."""
    notes: list[str] = []
    reason = str(pred.get("reason") or "")
    evidence = pred.get("evidence") or []
    if not isinstance(evidence, list):
        evidence = [str(evidence)]

    preds = derived_predicates(example)
    known_nums = input_numbers(example)
    known_ids = {norm(x) for x in input_ids(example)}

    # Evidence items should match derived predicates or expected style tokens
    ungrounded_ev = []
    for item in evidence:
        nitem = normalize_evidence_item(str(item))
        # allow if predicate matches ignoring spaces
        ok = any(normalize_evidence_item(p) == nitem or nitem in normalize_evidence_item(p) for p in preds)
        if not ok:
            # also allow raw substrings of known ids
            if not any(norm(i) in norm(str(item)) for i in input_ids(example)):
                ungrounded_ev.append(str(item))

    # Invented invoice-like tokens (require INV_ prefix — do not match the word "invoice")
    inv_mentions = re.findall(r"INV_[A-Z0-9_]+", reason, flags=re.I)
    for m in inv_mentions:
        if m.upper() not in {x.upper() for x in input_ids(example)}:
            notes.append(f"invented_invoice:{m}")

    # Large amounts in reason that are not in input
    amount_mentions = re.findall(r"\$?\d{4,}(?:\.\d+)?", reason)
    for am in amount_mentions:
        cleaned = am.replace("$", "").rstrip("0").rstrip(".") if "." in am else am.replace("$", "")
        # compare loosely
        if cleaned not in known_nums and am.replace("$", "") not in known_nums:
            # allow if it's a threshold phrase already in expected style — still flag
            notes.append(f"invented_amount:{am}")

    # Collector names
    col_mentions = re.findall(r"col_[a-z0-9_]+", reason, flags=re.I)
    for m in col_mentions:
        if norm(m) not in known_ids:
            notes.append(f"invented_collector:{m}")

    hallucinated = bool(notes) or bool(ungrounded_ev)
    if ungrounded_ev:
        notes.append(f"ungrounded_evidence:{ungrounded_ev}")
    grounded = not hallucinated and len(evidence) > 0
    return grounded, hallucinated, notes


def evidence_coverage(example: dict[str, Any], pred: dict[str, Any]) -> float:
    expected = {normalize_evidence_item(x) for x in example.get("expected_evidence") or []}
    got = {normalize_evidence_item(str(x)) for x in (pred.get("evidence") or [])}
    if not expected:
        return 1.0
    overlap = expected & got
    # soft match: expected token contained in any got item
    if not overlap:
        for e in expected:
            for g in got:
                if e in g or g in e:
                    overlap.add(e)
                    break
    return len(overlap) / len(expected)


def confidence_metrics(example: dict[str, Any], pred: dict[str, Any]) -> dict[str, float]:
    try:
        conf = float(pred.get("confidence"))
    except (TypeError, ValueError):
        conf = 0.0
    conf = min(1.0, max(0.0, conf))
    expected = float(example.get("expected_confidence") or 0.0)
    penalty = max(0.0, conf - expected - 0.15)
    out = {"confidence": conf, "expected_confidence": expected, "confidence_penalty": penalty, "abs_err": abs(conf - expected)}
    label = (example.get("metadata") or {}).get("success_label")
    if label is not None:
        y = float(label)
        out["brier"] = (conf - y) ** 2
    return out


def score_example(example: dict[str, Any], pred: dict[str, Any] | None) -> dict[str, Any]:
    if pred is None:
        return {
            "id": example["id"],
            "policy_pass": False,
            "grounded": False,
            "hallucinated": True,
            "action_match": False,
            "evidence_coverage": 0.0,
            "overall_pass": False,
            "failures": ["missing_prediction"],
            "latency_ms": None,
        }

    policy_pass, policy_failures = check_policy(example, pred)
    grounded, hallucinated, gnotes = check_groundedness(example, pred)
    cov = evidence_coverage(example, pred)
    conf = confidence_metrics(example, pred)

    exp_canon = canonical_action(str(example.get("expected_action") or ""))
    pred_canon = canonical_action(str(pred.get("action") or ""))
    action_match = bool(exp_canon and pred_canon and exp_canon == pred_canon)
    if not action_match:
        # exact normalized fallback
        action_match = norm(str(pred.get("action"))) == norm(str(example.get("expected_action")))

    evidence_ok = cov > 0  # >=1 expected item overlap
    failures = list(policy_failures)
    if hallucinated:
        failures.append("hallucination")
    if not grounded:
        failures.append("ungrounded")
    if not action_match:
        failures.append("action_mismatch")
    if not evidence_ok:
        failures.append("evidence_coverage")

    overall = policy_pass and (not hallucinated) and grounded and action_match and evidence_ok

    return {
        "id": example["id"],
        "expected_action": example.get("expected_action"),
        "predicted_action": pred.get("action"),
        "policy_pass": policy_pass,
        "policy_failures": policy_failures,
        "grounded": grounded,
        "hallucinated": hallucinated,
        "groundedness_notes": gnotes,
        "action_match": action_match,
        "evidence_coverage": cov,
        "evidence_ok": evidence_ok,
        "confidence": conf,
        "overall_pass": overall,
        "failures": failures,
        "latency_ms": pred.get("latency_ms"),
        "split": (example.get("metadata") or {}).get("split"),
    }


def aggregate(scores: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(scores) or 1
    latencies = [s["latency_ms"] for s in scores if isinstance(s.get("latency_ms"), (int, float))]
    briers = [s["confidence"]["brier"] for s in scores if "brier" in (s.get("confidence") or {})]
    return {
        "n": len(scores),
        "action_match_rate": sum(1 for s in scores if s["action_match"]) / n,
        "policy_pass_rate": sum(1 for s in scores if s["policy_pass"]) / n,
        "groundedness_rate": sum(1 for s in scores if s["grounded"]) / n,
        "hallucination_rate": sum(1 for s in scores if s["hallucinated"]) / n,
        "evidence_coverage_mean": sum(s["evidence_coverage"] for s in scores) / n,
        "overall_pass_rate": sum(1 for s in scores if s["overall_pass"]) / n,
        "confidence_mae": sum(s["confidence"]["abs_err"] for s in scores) / n,
        "brier_score": (sum(briers) / len(briers)) if briers else None,
        "median_latency_ms": median(latencies) if latencies else None,
        "top_failures": sorted(
            [s for s in scores if not s["overall_pass"]],
            key=lambda x: (0 if x["hallucinated"] else 1, 0 if not x["policy_pass"] else 1),
        )[:10],
    }


def passes_thresholds(agg: dict[str, Any], thresholds: dict[str, float]) -> dict[str, bool]:
    return {
        "policy_pass_rate": agg["policy_pass_rate"] >= thresholds.get("policy_pass_rate", 0.95),
        "groundedness_rate": agg["groundedness_rate"] >= thresholds.get("groundedness_rate", 0.95),
        "hallucination_rate": agg["hallucination_rate"]
        < thresholds.get("hallucination_rate_max", 0.05),
        "evidence_coverage_mean": agg["evidence_coverage_mean"]
        >= thresholds.get("evidence_coverage_mean", 0.50),
    }


def write_csv(path: Path, scores: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "id",
        "split",
        "expected_action",
        "predicted_action",
        "action_match",
        "policy_pass",
        "grounded",
        "hallucinated",
        "evidence_coverage",
        "overall_pass",
        "failures",
        "latency_ms",
    ]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for s in scores:
            w.writerow(
                {
                    "id": s["id"],
                    "split": s.get("split"),
                    "expected_action": s.get("expected_action"),
                    "predicted_action": s.get("predicted_action"),
                    "action_match": s["action_match"],
                    "policy_pass": s["policy_pass"],
                    "grounded": s["grounded"],
                    "hallucinated": s["hallucinated"],
                    "evidence_coverage": round(s["evidence_coverage"], 4),
                    "overall_pass": s["overall_pass"],
                    "failures": "|".join(s.get("failures") or []),
                    "latency_ms": s.get("latency_ms"),
                }
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--examples",
        type=Path,
        default=REPO_ROOT / "data/collections_specialist/examples.jsonl",
    )
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument(
        "--out",
        type=Path,
        default=REPO_ROOT / "artifacts/collections_eval/metrics.json",
    )
    parser.add_argument("--split", choices=["holdout", "train", "all"], default="holdout")
    parser.add_argument("--csv", type=Path, default=None)
    args = parser.parse_args(argv)

    examples = load_jsonl(args.examples)
    if args.split != "all":
        examples = [e for e in examples if (e.get("metadata") or {}).get("split") == args.split]
    preds_list = load_jsonl(args.predictions)
    by_id = {p["id"]: p for p in preds_list if "id" in p}

    scores = [score_example(ex, by_id.get(ex["id"])) for ex in examples]
    agg = aggregate(scores)
    thresholds = {
        "policy_pass_rate": 0.95,
        "groundedness_rate": 0.95,
        "hallucination_rate_max": 0.05,
        "evidence_coverage_mean": 0.50,
    }
    gate = passes_thresholds(agg, thresholds)
    payload = {
        "examples_path": str(args.examples),
        "predictions_path": str(args.predictions),
        "split": args.split,
        "aggregate": {k: v for k, v in agg.items() if k != "top_failures"},
        "threshold_gates": gate,
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
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    csv_path = args.csv or args.out.with_suffix(".csv")
    write_csv(csv_path, scores)
    print(
        json.dumps(
            {
                "out": str(args.out),
                "csv": str(csv_path),
                "aggregate": payload["aggregate"],
                "threshold_gates": gate,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
