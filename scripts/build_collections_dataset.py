#!/usr/bin/env python3
"""Build / validate collections specialist JSONL (pseudonymized).

Week 0: emits the curated synthetic gold set. With --source, normalizes an
internal fixture file through the same schema + pseudonymization helpers.

Never writes real emails or raw ERP identifiers into the output JSONL.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

REQUIRED_TOP = [
    "id",
    "organization_id",
    "customer",
    "invoices",
    "collector_context",
    "policy_flags",
    "instruction",
    "expected_action",
    "expected_reason",
    "expected_confidence",
    "expected_evidence",
    "metadata",
]

HEALTH = {"healthy", "watch", "at_risk", "critical"}
AVAIL = {"available", "pto", "unavailable"}
SKILLS = {"automation", "standard", "dispute", "strategic"}
SPLITS = {"train", "holdout"}

DEFAULT_INSTRUCTION = (
    "Given this customer and invoice context produce a JSON recommendation: "
    "action, reason, confidence (0-1), evidence (list of facts present in input). "
    "Use only input facts."
)

REPO_ROOT = Path(__file__).resolve().parents[1]


def stable_token(prefix: str, value: str, seed: int = 42) -> str:
    h = hashlib.sha256(f"{seed}:{prefix}:{value}".encode()).hexdigest()[:6]
    return f"{prefix}_{h}"


def pseudonymize_name(name: str) -> str:
    token = re.sub(r"[^A-Za-z0-9]+", "_", name.strip().upper()).strip("_") or "CUST"
    if not token.endswith("_PSEUD"):
        token = f"{token}_PSEUD"
    return token


def open_ar(invoices: list[dict[str, Any]]) -> float:
    return float(sum(float(i.get("open_balance", 0) or 0) for i in invoices))


def validate_row(row: dict[str, Any], idx: int) -> None:
    missing = [k for k in REQUIRED_TOP if k not in row]
    if missing:
        raise ValueError(f"row {idx} missing keys: {missing}")
    cust = row["customer"]
    if cust.get("health") not in HEALTH:
        raise ValueError(f"row {idx} bad health: {cust.get('health')}")
    ctx = row["collector_context"]
    if ctx.get("availability") not in AVAIL:
        raise ValueError(f"row {idx} bad availability")
    if ctx.get("skill") not in SKILLS:
        raise ValueError(f"row {idx} bad skill")
    conf = float(row["expected_confidence"])
    if not 0.0 <= conf <= 1.0:
        raise ValueError(f"row {idx} confidence out of range")
    if not isinstance(row["invoices"], list) or not row["invoices"]:
        raise ValueError(f"row {idx} invoices must be non-empty list")
    split = (row.get("metadata") or {}).get("split")
    if split not in SPLITS:
        raise ValueError(f"row {idx} metadata.split must be train|holdout")
    if not isinstance(row["expected_evidence"], list) or not row["expected_evidence"]:
        raise ValueError(f"row {idx} expected_evidence required")


def normalize_source_row(raw: dict[str, Any], seed: int) -> dict[str, Any]:
    """Map a loose fixture into the gold schema with pseudonymization."""
    org = raw.get("organization_id") or raw.get("org_id") or "org_unknown"
    cust_in = raw.get("customer") or {}
    cust_id = cust_in.get("id") or cust_in.get("customer_id") or "unknown"
    name = pseudonymize_name(str(cust_in.get("name") or cust_id))
    invoices = []
    for inv in raw.get("invoices") or []:
        num = inv.get("invoice_number") or inv.get("invoice") or "UNK"
        if not str(num).startswith("INV_P_"):
            num = f"INV_P_{stable_token('inv', str(num), seed).split('_', 1)[1]}"
        invoices.append(
            {
                "invoice_number": num,
                "days_past_due": int(inv.get("days_past_due", 0) or 0),
                "open_balance": float(inv.get("open_balance", inv.get("amount", 0)) or 0),
                "dispute_flag": bool(inv.get("dispute_flag", False)),
                "promise_to_pay_date": inv.get("promise_to_pay_date"),
            }
        )
    ctx_in = raw.get("collector_context") or {}
    collector = ctx_in.get("assigned_collector") or "collector"
    if not str(collector).startswith("col_"):
        collector = f"col_{stable_token('c', str(collector), seed).split('_', 1)[1]}"
    meta = dict(raw.get("metadata") or {})
    meta.setdefault("created_at", "2026-10-12")
    meta.setdefault("source_file_or_query", "external_fixture")
    meta.setdefault("split", "train")
    row = {
        "id": raw.get("id") or stable_token("rec", str(cust_id), seed),
        "organization_id": org if str(org).startswith("org_") else stable_token("org", str(org), seed),
        "customer": {
            "id": cust_id if str(cust_id).startswith("cust_") else stable_token("cust", str(cust_id), seed),
            "name": name,
            "risk_score": float(cust_in.get("risk_score", 50) or 50),
            "health": cust_in.get("health") or "watch",
            "strategic_account": bool(cust_in.get("strategic_account", False)),
            "last_contact_at": cust_in.get("last_contact_at"),
        },
        "invoices": invoices,
        "collector_context": {
            "assigned_collector": collector,
            "availability": ctx_in.get("availability") or "available",
            "skill": ctx_in.get("skill") or "standard",
        },
        "policy_flags": list(raw.get("policy_flags") or ["no_split_customer"]),
        "instruction": raw.get("instruction") or DEFAULT_INSTRUCTION,
        "expected_action": raw["expected_action"],
        "expected_reason": raw["expected_reason"],
        "expected_confidence": float(raw["expected_confidence"]),
        "expected_evidence": list(raw["expected_evidence"]),
        "metadata": meta,
    }
    if cust_in.get("parent_account"):
        row["customer"]["parent_account"] = pseudonymize_name(str(cust_in["parent_account"]))
    return row


def gold_examples() -> list[dict[str, Any]]:
    """25 curated gold examples; first three match the product brief exactly."""
    short = "Produce recommendation JSON using only facts in the input."
    rows: list[dict[str, Any]] = [
        # --- Example 1 (brief) ---
        {
            "id": "rec_0001",
            "organization_id": "org_01",
            "customer": {
                "id": "cust_01",
                "name": "ACME_PSEUD",
                "risk_score": 82,
                "health": "at_risk",
                "strategic_account": True,
                "last_contact_at": None,
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_1021",
                    "days_past_due": 120,
                    "open_balance": 180000,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                },
                {
                    "invoice_number": "INV_P_1044",
                    "days_past_due": 45,
                    "open_balance": 240000,
                    "dispute_flag": True,
                    "promise_to_pay_date": None,
                },
            ],
            "collector_context": {
                "assigned_collector": "col_jane",
                "availability": "available",
                "skill": "dispute",
            },
            "policy_flags": ["dispute_specialist_required", "no_split_customer"],
            "instruction": DEFAULT_INSTRUCTION,
            "expected_action": "Route to dispute specialist",
            "expected_reason": (
                "An active disputed invoice plus high open AR and risk (82) "
                "indicates routing to a dispute-capable collector."
            ),
            "expected_confidence": 0.86,
            "expected_evidence": [
                "risk_score>=80",
                "INV_P_1044.dispute_flag==true",
                "open_ar>100000",
            ],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        # --- Example 2 (brief) ---
        {
            "id": "rec_0002",
            "organization_id": "org_01",
            "customer": {
                "id": "cust_02",
                "name": "SMALLCO_PSEUD",
                "risk_score": 25,
                "health": "healthy",
                "strategic_account": False,
                "last_contact_at": "2026-09-01T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_2001",
                    "days_past_due": 10,
                    "open_balance": 120.0,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_auto",
                "availability": "available",
                "skill": "automation",
            },
            "policy_flags": ["low_dollar_quick_win"],
            "instruction": short,
            "expected_action": "Send automated reminder",
            "expected_reason": (
                "Low-dollar balance under quick-win threshold; automation preferred "
                "to reduce manual workload."
            ),
            "expected_confidence": 0.73,
            "expected_evidence": ["open_ar<5000", "risk_score<30"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        # --- Example 3 (brief) ---
        {
            "id": "rec_0003",
            "organization_id": "org_01",
            "customer": {
                "id": "cust_03",
                "name": "ACME_CHILD_PSEUD",
                "risk_score": 65,
                "health": "watch",
                "strategic_account": False,
                "parent_account": "ACME_PSEUD",
                "last_contact_at": None,
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_3001",
                    "days_past_due": 0,
                    "open_balance": 15000,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_mike",
                "availability": "available",
                "skill": "standard",
            },
            "policy_flags": ["parent_child_grouping"],
            "instruction": "Produce recommended action JSON.",
            "expected_action": "Call AP contact",
            "expected_reason": (
                "Meaningful open AR and medium risk score indicate direct collector outreach."
            ),
            "expected_confidence": 0.70,
            "expected_evidence": ["open_ar>=10000", "risk_score>=60"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        # --- train 4–15 ---
        {
            "id": "rec_0004",
            "organization_id": "org_02",
            "customer": {
                "id": "cust_04",
                "name": "NORTHWIND_PSEUD",
                "risk_score": 55,
                "health": "watch",
                "strategic_account": False,
                "last_contact_at": "2026-08-15T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_4001",
                    "days_past_due": 35,
                    "open_balance": 8200,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_pat",
                "availability": "pto",
                "skill": "standard",
            },
            "policy_flags": ["no_pto_assignment", "no_split_customer"],
            "instruction": short,
            "expected_action": "Reassign to available collector",
            "expected_reason": (
                "Assigned collector is on PTO; work must move to an available collector."
            ),
            "expected_confidence": 0.91,
            "expected_evidence": ["collector.availability==pto", "open_ar>=1000"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0005",
            "organization_id": "org_02",
            "customer": {
                "id": "cust_05",
                "name": "GLOBEX_PSEUD",
                "risk_score": 90,
                "health": "critical",
                "strategic_account": True,
                "last_contact_at": "2026-07-01T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_5001",
                    "days_past_due": 180,
                    "open_balance": 950000,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_ria",
                "availability": "available",
                "skill": "strategic",
            },
            "policy_flags": ["strategic_qualified_collector", "no_split_customer"],
            "instruction": short,
            "expected_action": "Escalate to manager",
            "expected_reason": (
                "Strategic account with critical health, extreme aging, and very high open AR."
            ),
            "expected_confidence": 0.88,
            "expected_evidence": [
                "strategic_account==true",
                "days_past_due>=180",
                "open_ar>100000",
            ],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0006",
            "organization_id": "org_02",
            "customer": {
                "id": "cust_06",
                "name": "INITECH_PSEUD",
                "risk_score": 40,
                "health": "watch",
                "strategic_account": False,
                "last_contact_at": "2026-09-20T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_6001",
                    "days_past_due": 20,
                    "open_balance": 4500,
                    "dispute_flag": False,
                    "promise_to_pay_date": "2026-10-20T00:00:00Z",
                }
            ],
            "collector_context": {
                "assigned_collector": "col_sam",
                "availability": "available",
                "skill": "standard",
            },
            "policy_flags": ["honor_promise_to_pay"],
            "instruction": short,
            "expected_action": "Hold — await promise-to-pay",
            "expected_reason": (
                "Valid future promise-to-pay date exists with moderate risk; hold outreach."
            ),
            "expected_confidence": 0.77,
            "expected_evidence": [
                "INV_P_6001.promise_to_pay_date!=null",
                "risk_score<50",
            ],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0007",
            "organization_id": "org_03",
            "customer": {
                "id": "cust_07",
                "name": "UMBRELLA_PSEUD",
                "risk_score": 48,
                "health": "watch",
                "strategic_account": False,
                "last_contact_at": "2026-06-01T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_7001",
                    "days_past_due": 25,
                    "open_balance": 6200,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_lee",
                "availability": "available",
                "skill": "standard",
            },
            "policy_flags": ["no_split_customer"],
            "instruction": short,
            "expected_action": "Email payment reminder",
            "expected_reason": (
                "Mid-dollar open AR with contact gap and non-dispute invoices favors email."
            ),
            "expected_confidence": 0.68,
            "expected_evidence": ["open_ar>=5000", "open_ar<10000", "dispute_flag==false"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0008",
            "organization_id": "org_03",
            "customer": {
                "id": "cust_08",
                "name": "ACME_WEST_PSEUD",
                "risk_score": 58,
                "health": "watch",
                "strategic_account": False,
                "parent_account": "ACME_PSEUD",
                "last_contact_at": None,
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_8001",
                    "days_past_due": 12,
                    "open_balance": 11000,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_mike",
                "availability": "available",
                "skill": "standard",
            },
            "policy_flags": ["parent_child_grouping", "no_split_customer"],
            "instruction": short,
            "expected_action": "Keep parent-child grouping",
            "expected_reason": (
                "Child account under ACME_PSEUD must stay grouped; do not isolate ownership."
            ),
            "expected_confidence": 0.84,
            "expected_evidence": [
                "parent_account==ACME_PSEUD",
                "policy:parent_child_grouping",
            ],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0009",
            "organization_id": "org_03",
            "customer": {
                "id": "cust_09",
                "name": "STARK_PSEUD",
                "risk_score": 78,
                "health": "at_risk",
                "strategic_account": True,
                "last_contact_at": None,
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_9001",
                    "days_past_due": 60,
                    "open_balance": 220000,
                    "dispute_flag": True,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_jane",
                "availability": "available",
                "skill": "dispute",
            },
            "policy_flags": [
                "dispute_specialist_required",
                "strategic_qualified_collector",
            ],
            "instruction": short,
            "expected_action": "Route to dispute specialist",
            "expected_reason": (
                "Strategic account with disputed invoice requires dispute-capable routing."
            ),
            "expected_confidence": 0.89,
            "expected_evidence": [
                "strategic_account==true",
                "INV_P_9001.dispute_flag==true",
            ],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0010",
            "organization_id": "org_03",
            "customer": {
                "id": "cust_10",
                "name": "TINYSHOP_PSEUD",
                "risk_score": 18,
                "health": "healthy",
                "strategic_account": False,
                "last_contact_at": "2026-09-28T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_10001",
                    "days_past_due": 5,
                    "open_balance": 89.5,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_auto",
                "availability": "available",
                "skill": "automation",
            },
            "policy_flags": ["low_dollar_quick_win"],
            "instruction": short,
            "expected_action": "Send automated reminder",
            "expected_reason": "Very low open AR and low risk; automation is preferred.",
            "expected_confidence": 0.80,
            "expected_evidence": ["open_ar<5000", "risk_score<30"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0011",
            "organization_id": "org_04",
            "customer": {
                "id": "cust_11",
                "name": "HONEX_PSEUD",
                "risk_score": 72,
                "health": "at_risk",
                "strategic_account": False,
                "last_contact_at": "2026-05-01T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_11001",
                    "days_past_due": 95,
                    "open_balance": 34000,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_sam",
                "availability": "available",
                "skill": "standard",
            },
            "policy_flags": ["no_split_customer"],
            "instruction": short,
            "expected_action": "Call AP contact",
            "expected_reason": (
                "High days past due with material open AR requires direct AP outreach."
            ),
            "expected_confidence": 0.81,
            "expected_evidence": ["days_past_due>=90", "open_ar>=10000", "risk_score>=70"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0012",
            "organization_id": "org_04",
            "customer": {
                "id": "cust_12",
                "name": "VEHEMENT_PSEUD",
                "risk_score": 44,
                "health": "watch",
                "strategic_account": False,
                "last_contact_at": None,
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_12001",
                    "days_past_due": 40,
                    "open_balance": 9100,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_kim",
                "availability": "unavailable",
                "skill": "standard",
            },
            "policy_flags": ["no_pto_assignment", "no_split_customer"],
            "instruction": short,
            "expected_action": "Reassign to available collector",
            "expected_reason": (
                "Assigned collector is unavailable; reassign before further outreach."
            ),
            "expected_confidence": 0.90,
            "expected_evidence": ["collector.availability==unavailable"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0013",
            "organization_id": "org_04",
            "customer": {
                "id": "cust_13",
                "name": "MASSIVE_PSEUD",
                "risk_score": 70,
                "health": "at_risk",
                "strategic_account": True,
                "last_contact_at": "2026-08-01T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_13001",
                    "days_past_due": 50,
                    "open_balance": 125000,
                    "dispute_flag": False,
                    "promise_to_pay_date": "2026-09-01T00:00:00Z",
                }
            ],
            "collector_context": {
                "assigned_collector": "col_ria",
                "availability": "available",
                "skill": "strategic",
            },
            "policy_flags": ["broken_promise_escalate", "strategic_qualified_collector"],
            "instruction": short,
            "expected_action": "Escalate to manager",
            "expected_reason": (
                "Strategic account with broken past promise-to-pay and high open AR."
            ),
            "expected_confidence": 0.83,
            "expected_evidence": [
                "strategic_account==true",
                "promise_to_pay_date_past",
                "open_ar>100000",
            ],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0014",
            "organization_id": "org_05",
            "customer": {
                "id": "cust_14",
                "name": "PIVOT_PSEUD",
                "risk_score": 35,
                "health": "healthy",
                "strategic_account": False,
                "last_contact_at": "2026-09-10T00:00:00Z",
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_14001",
                    "days_past_due": 18,
                    "open_balance": 7800,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            "collector_context": {
                "assigned_collector": "col_lee",
                "availability": "available",
                "skill": "standard",
            },
            "policy_flags": ["no_split_customer"],
            "instruction": short,
            "expected_action": "Email payment reminder",
            "expected_reason": (
                "Healthy account with mid-dollar AR and no dispute; email reminder fits."
            ),
            "expected_confidence": 0.71,
            "expected_evidence": ["open_ar>=5000", "health==healthy", "dispute_flag==false"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
        {
            "id": "rec_0015",
            "organization_id": "org_05",
            "customer": {
                "id": "cust_15",
                "name": "APEX_PSEUD",
                "risk_score": 88,
                "health": "critical",
                "strategic_account": False,
                "last_contact_at": None,
            },
            "invoices": [
                {
                    "invoice_number": "INV_P_15001",
                    "days_past_due": 110,
                    "open_balance": 67000,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                },
                {
                    "invoice_number": "INV_P_15002",
                    "days_past_due": 75,
                    "open_balance": 12000,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                },
            ],
            "collector_context": {
                "assigned_collector": "col_sam",
                "availability": "available",
                "skill": "standard",
            },
            "policy_flags": ["no_split_customer"],
            "instruction": short,
            "expected_action": "Call AP contact",
            "expected_reason": (
                "Critical health with high risk and material multi-invoice AR needs a call."
            ),
            "expected_confidence": 0.85,
            "expected_evidence": ["health==critical", "risk_score>=80", "open_ar>50000"],
            "metadata": {
                "created_at": "2026-10-12",
                "source_file_or_query": "synthetic_gold_v0",
                "split": "train",
            },
        },
    ]

    # --- holdout 16–25 (org_99 reserved) ---
    holdouts = [
        (
            "rec_0016",
            "cust_16",
            "HOLD_ALPHA_PSEUD",
            28,
            "healthy",
            False,
            None,
            [{"invoice_number": "INV_P_16001", "days_past_due": 8, "open_balance": 450.0, "dispute_flag": False, "promise_to_pay_date": None}],
            {"assigned_collector": "col_auto", "availability": "available", "skill": "automation"},
            ["low_dollar_quick_win"],
            "Send automated reminder",
            "Low risk and sub-threshold AR; send automated reminder.",
            0.76,
            ["open_ar<5000", "risk_score<30"],
        ),
        (
            "rec_0017",
            "cust_17",
            "HOLD_BETA_PSEUD",
            81,
            "at_risk",
            True,
            None,
            [{"invoice_number": "INV_P_17001", "days_past_due": 70, "open_balance": 190000, "dispute_flag": True, "promise_to_pay_date": None}],
            {"assigned_collector": "col_jane", "availability": "available", "skill": "dispute"},
            ["dispute_specialist_required", "strategic_qualified_collector"],
            "Route to dispute specialist",
            "Strategic disputed AR requires dispute specialist routing.",
            0.87,
            ["INV_P_17001.dispute_flag==true", "strategic_account==true"],
        ),
        (
            "rec_0018",
            "cust_18",
            "HOLD_GAMMA_PSEUD",
            62,
            "watch",
            False,
            "HOLD_PARENT_PSEUD",
            [{"invoice_number": "INV_P_18001", "days_past_due": 15, "open_balance": 14000, "dispute_flag": False, "promise_to_pay_date": None}],
            {"assigned_collector": "col_mike", "availability": "available", "skill": "standard"},
            ["parent_child_grouping", "no_split_customer"],
            "Keep parent-child grouping",
            "Child under HOLD_PARENT_PSEUD must remain grouped.",
            0.82,
            ["parent_account==HOLD_PARENT_PSEUD", "policy:parent_child_grouping"],
        ),
        (
            "rec_0019",
            "cust_19",
            "HOLD_DELTA_PSEUD",
            51,
            "watch",
            False,
            None,
            [{"invoice_number": "INV_P_19001", "days_past_due": 22, "open_balance": 5600, "dispute_flag": False, "promise_to_pay_date": None}],
            {"assigned_collector": "col_pat", "availability": "pto", "skill": "standard"},
            ["no_pto_assignment"],
            "Reassign to available collector",
            "Collector on PTO cannot retain the account.",
            0.92,
            ["collector.availability==pto"],
        ),
        (
            "rec_0020",
            "cust_20",
            "HOLD_EPSILON_PSEUD",
            66,
            "watch",
            False,
            None,
            [{"invoice_number": "INV_P_20001", "days_past_due": 0, "open_balance": 21000, "dispute_flag": False, "promise_to_pay_date": None}],
            {"assigned_collector": "col_lee", "availability": "available", "skill": "standard"},
            ["no_split_customer"],
            "Call AP contact",
            "Material open AR with elevated risk warrants a call.",
            0.74,
            ["open_ar>=10000", "risk_score>=60"],
        ),
        (
            "rec_0021",
            "cust_21",
            "HOLD_ZETA_PSEUD",
            42,
            "healthy",
            False,
            None,
            [{"invoice_number": "INV_P_21001", "days_past_due": 14, "open_balance": 3900, "dispute_flag": False, "promise_to_pay_date": "2026-10-25T00:00:00Z"}],
            {"assigned_collector": "col_sam", "availability": "available", "skill": "standard"},
            ["honor_promise_to_pay"],
            "Hold — await promise-to-pay",
            "Future PTP with moderate risk supports a hold.",
            0.75,
            ["INV_P_21001.promise_to_pay_date!=null", "risk_score<50"],
        ),
        (
            "rec_0022",
            "cust_22",
            "HOLD_ETA_PSEUD",
            93,
            "critical",
            True,
            None,
            [{"invoice_number": "INV_P_22001", "days_past_due": 200, "open_balance": 510000, "dispute_flag": False, "promise_to_pay_date": None}],
            {"assigned_collector": "col_ria", "availability": "available", "skill": "strategic"},
            ["strategic_qualified_collector"],
            "Escalate to manager",
            "Strategic critical aging with very high AR needs manager escalation.",
            0.90,
            ["strategic_account==true", "health==critical", "days_past_due>=180"],
        ),
        (
            "rec_0023",
            "cust_23",
            "HOLD_THETA_PSEUD",
            46,
            "watch",
            False,
            None,
            [{"invoice_number": "INV_P_23001", "days_past_due": 30, "open_balance": 8800, "dispute_flag": False, "promise_to_pay_date": None}],
            {"assigned_collector": "col_lee", "availability": "available", "skill": "standard"},
            ["no_split_customer"],
            "Email payment reminder",
            "Mid-dollar non-dispute AR favors an email reminder.",
            0.69,
            ["open_ar>=5000", "open_ar<10000"],
        ),
        (
            "rec_0024",
            "cust_24",
            "HOLD_IOTA_PSEUD",
            57,
            "watch",
            False,
            None,
            [{"invoice_number": "INV_P_24001", "days_past_due": 45, "open_balance": 10200, "dispute_flag": False, "promise_to_pay_date": None}],
            {"assigned_collector": "col_kim", "availability": "unavailable", "skill": "standard"},
            ["no_pto_assignment"],
            "Reassign to available collector",
            "Unavailable collector must be replaced before outreach.",
            0.91,
            ["collector.availability==unavailable"],
        ),
        (
            "rec_0025",
            "cust_25",
            "HOLD_KAPPA_PSEUD",
            79,
            "at_risk",
            False,
            None,
            [
                {"invoice_number": "INV_P_25001", "days_past_due": 88, "open_balance": 44000, "dispute_flag": True, "promise_to_pay_date": None},
                {"invoice_number": "INV_P_25002", "days_past_due": 40, "open_balance": 9000, "dispute_flag": False, "promise_to_pay_date": None},
            ],
            {"assigned_collector": "col_jane", "availability": "available", "skill": "dispute"},
            ["dispute_specialist_required", "no_split_customer"],
            "Route to dispute specialist",
            "Active dispute on INV_P_25001 with elevated risk requires dispute routing.",
            0.84,
            ["INV_P_25001.dispute_flag==true", "risk_score>=70", "open_ar>50000"],
        ),
    ]

    for (
        rid,
        cid,
        cname,
        risk,
        health,
        strategic,
        parent,
        invoices,
        ctx,
        flags,
        action,
        reason,
        conf,
        evidence,
    ) in holdouts:
        cust: dict[str, Any] = {
            "id": cid,
            "name": cname,
            "risk_score": risk,
            "health": health,
            "strategic_account": strategic,
            "last_contact_at": None,
        }
        if parent:
            cust["parent_account"] = parent
        rows.append(
            {
                "id": rid,
                "organization_id": "org_99",
                "customer": cust,
                "invoices": invoices,
                "collector_context": ctx,
                "policy_flags": flags,
                "instruction": short,
                "expected_action": action,
                "expected_reason": reason,
                "expected_confidence": conf,
                "expected_evidence": evidence,
                "metadata": {
                    "created_at": "2026-10-12",
                    "source_file_or_query": "synthetic_gold_v0",
                    "split": "holdout",
                },
            }
        )

    return rows


def load_source(path: Path, seed: int) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".jsonl":
        raw_rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    else:
        payload = json.loads(text)
        raw_rows = payload if isinstance(payload, list) else payload.get("examples", [])
    return [normalize_source_row(r, seed) for r in raw_rows]


def write_jsonl(rows: list[dict[str, Any]], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        help="Optional JSON/JSONL fixture to normalize (otherwise emit curated gold)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=REPO_ROOT / "data/collections_specialist/examples.jsonl",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate existing --out (or gold) without rewriting",
    )
    args = parser.parse_args(argv)

    if args.validate_only:
        target = args.out if args.out.exists() else None
        if target is None:
            rows = gold_examples()
        else:
            rows = [json.loads(line) for line in target.read_text().splitlines() if line.strip()]
        for i, row in enumerate(rows):
            validate_row(row, i)
        holdout = sum(1 for r in rows if r["metadata"]["split"] == "holdout")
        print(json.dumps({"ok": True, "n": len(rows), "holdout": holdout, "path": str(target or "gold")}))
        return 0

    rows = load_source(args.source, args.seed) if args.source else gold_examples()
    for i, row in enumerate(rows):
        validate_row(row, i)
    if len(rows) < 25 and not args.source:
        raise SystemExit("gold set must contain 25 examples")
    holdout = sum(1 for r in rows if r["metadata"]["split"] == "holdout")
    if not args.source and holdout < 10:
        raise SystemExit("gold set must include >=10 holdout examples")
    write_jsonl(rows, args.out)
    print(
        json.dumps(
            {
                "wrote": str(args.out),
                "n": len(rows),
                "holdout": holdout,
                "train": len(rows) - holdout,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
