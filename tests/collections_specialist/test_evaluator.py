#!/usr/bin/env python3
"""Unit tests for collections recommendation evaluator."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from evaluate_collections_recommendations import (  # noqa: E402
    aggregate,
    score_example,
)


def base_example(**overrides):
    ex = {
        "id": "t_001",
        "organization_id": "org_01",
        "customer": {
            "id": "cust_t",
            "name": "TEST_PSEUD",
            "risk_score": 82,
            "health": "at_risk",
            "strategic_account": True,
            "last_contact_at": None,
        },
        "invoices": [
            {
                "invoice_number": "INV_P_9",
                "days_past_due": 45,
                "open_balance": 240000,
                "dispute_flag": True,
                "promise_to_pay_date": None,
            }
        ],
        "collector_context": {
            "assigned_collector": "col_jane",
            "availability": "available",
            "skill": "dispute",
        },
        "policy_flags": ["dispute_specialist_required", "no_split_customer"],
        "instruction": "test",
        "expected_action": "Route to dispute specialist",
        "expected_reason": "dispute",
        "expected_confidence": 0.86,
        "expected_evidence": [
            "risk_score>=80",
            "INV_P_9.dispute_flag==true",
            "open_ar>100000",
        ],
        "metadata": {"split": "holdout", "created_at": "2026-10-12"},
    }
    ex.update(overrides)
    return ex


class EvaluatorTests(unittest.TestCase):
    def test_good_prediction_passes(self):
        ex = base_example()
        pred = {
            "action": "Route to dispute specialist",
            "reason": "INV_P_9 disputed with risk 82 and high AR.",
            "confidence": 0.86,
            "evidence": [
                "risk_score>=80",
                "INV_P_9.dispute_flag==true",
                "open_ar>100000",
            ],
        }
        score = score_example(ex, pred)
        self.assertTrue(score["action_match"])
        self.assertTrue(score["policy_pass"])
        self.assertTrue(score["grounded"])
        self.assertFalse(score["hallucinated"])
        self.assertGreater(score["evidence_coverage"], 0)
        self.assertTrue(score["overall_pass"])

    def test_pto_hard_fail(self):
        ex = base_example()
        ex["collector_context"] = {
            "assigned_collector": "col_pat",
            "availability": "pto",
            "skill": "standard",
        }
        ex["expected_action"] = "Reassign to available collector"
        ex["expected_evidence"] = ["collector.availability==pto"]
        pred = {
            "action": "Call AP contact",
            "reason": "Call despite PTO.",
            "confidence": 0.7,
            "evidence": ["collector.availability==pto"],
        }
        score = score_example(ex, pred)
        self.assertFalse(score["policy_pass"])
        self.assertIn("POL-PTO-01", score["policy_failures"])

    def test_strategic_automation_hard_fail(self):
        ex = base_example()
        pred = {
            "action": "Send automated reminder",
            "reason": "Auto for strategic.",
            "confidence": 0.9,
            "evidence": ["strategic_account==true", "risk_score>=80"],
        }
        score = score_example(ex, pred)
        self.assertFalse(score["policy_pass"])
        self.assertIn("POL-STRAT-01", score["policy_failures"])

    def test_split_customer_hard_fail(self):
        ex = base_example()
        pred = {
            "action": "Call AP contact",
            "reason": "Split the customer across collectors for disputed vs clean invoices.",
            "confidence": 0.6,
            "evidence": ["INV_P_9.dispute_flag==true", "risk_score>=80"],
        }
        score = score_example(ex, pred)
        self.assertFalse(score["policy_pass"])
        self.assertIn("POL-SPLIT-01", score["policy_failures"])

    def test_hallucinated_invoice(self):
        ex = base_example()
        pred = {
            "action": "Route to dispute specialist",
            "reason": "Invoice INV_P_FAKE shows a dispute.",
            "confidence": 0.8,
            "evidence": [
                "risk_score>=80",
                "INV_P_9.dispute_flag==true",
                "open_ar>100000",
            ],
        }
        score = score_example(ex, pred)
        self.assertTrue(score["hallucinated"])
        self.assertFalse(score["overall_pass"])

    def test_action_synonym_match(self):
        ex = base_example()
        pred = {
            "action": "assign dispute collector",
            "reason": "Dispute on INV_P_9 with risk 82.",
            "confidence": 0.8,
            "evidence": [
                "risk_score>=80",
                "INV_P_9.dispute_flag==true",
                "open_ar>100000",
            ],
        }
        score = score_example(ex, pred)
        self.assertTrue(score["action_match"])

    def test_snake_case_dispute_synonym(self):
        ex = base_example()
        pred = {
            "action": "assign_dispute_specialist",
            "reason": "Dispute on INV_P_9 with risk 82.",
            "confidence": 0.8,
            "evidence": [
                "risk_score>=80",
                "INV_P_9.dispute_flag==true",
                "open_ar>100000",
            ],
        }
        score = score_example(ex, pred)
        self.assertTrue(score["action_match"])
        self.assertTrue(score["overall_pass"])

    def test_field_value_evidence_grounded(self):
        ex = base_example(
            customer={
                "id": "cust_t",
                "name": "TEST_PSEUD",
                "risk_score": 28,
                "health": "healthy",
                "strategic_account": False,
                "last_contact_at": None,
            },
            invoices=[
                {
                    "invoice_number": "INV_P_16001",
                    "days_past_due": 8,
                    "open_balance": 450.0,
                    "dispute_flag": False,
                    "promise_to_pay_date": None,
                }
            ],
            policy_flags=["low_dollar_quick_win"],
            expected_action="Send automated reminder",
            expected_evidence=["open_ar<5000", "risk_score<30"],
            collector_context={
                "assigned_collector": "col_auto",
                "availability": "available",
                "skill": "automation",
            },
        )
        pred = {
            "action": "Send automated reminder",
            "reason": "Low risk 28 and open balance 450 favor automation.",
            "confidence": 0.75,
            "evidence": ["risk_score: 28", "open_balance: $450.00", "days_past_due: 8"],
        }
        score = score_example(ex, pred)
        self.assertFalse(score["hallucinated"])
        self.assertTrue(score["grounded"])

    def test_aggregate_rates(self):
        ex = base_example()
        good = score_example(
            ex,
            {
                "action": "Route to dispute specialist",
                "reason": "INV_P_9 disputed risk 82.",
                "confidence": 0.86,
                "evidence": [
                    "risk_score>=80",
                    "INV_P_9.dispute_flag==true",
                    "open_ar>100000",
                ],
            },
        )
        bad = score_example(
            ex,
            {
                "action": "Send automated reminder",
                "reason": "Invented INV_P_ZZZ for $9999999.",
                "confidence": 0.99,
                "evidence": ["made_up_fact"],
            },
        )
        agg = aggregate([good, bad])
        self.assertEqual(agg["n"], 2)
        self.assertAlmostEqual(agg["action_match_rate"], 0.5)
        self.assertGreater(agg["hallucination_rate"], 0)


if __name__ == "__main__":
    unittest.main()
