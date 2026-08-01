"""Acceptance gates must fail on deliberately defective synthetic measurements."""

from copy import deepcopy
from datetime import datetime, timedelta

import pytest

from quality.gates import (
    CollinearityExemption,
    GateStatus,
    evaluate_all_gates,
    judge_archetype_recoverability,
    judge_conditional_independence,
    judge_feature_degeneracy,
    judge_label_composition,
    judge_label_degeneracy,
    judge_leakage_windows,
    judge_plausibility,
)

ARCHETYPES = {"reliable": 200, "risky": 200, "bad-actor": 200}


def _seed(seed: int, *, role="freelancer"):
    """One adequate-size signal-audit result; each test changes only its target fact."""
    label_values = list(range(20)) * 10
    return {
        "seed": seed,
        "roles": {
            role: {
                "scoreable_by_archetype": deepcopy(ARCHETYPES),
                "feature_separations": {
                    "ghost_rate": 0.8,
                    "on_time_rate": 0.8,
                    "paid_in_full_rate": 0.8,
                    "scope_creep_rate": 0.8,
                    "avg_days_late": 0.6,
                    "subject_role": 0.0,
                },
                "conditional_term_separations": {
                    "on_time_rate": 0.4,
                    "paid_in_full_rate": 0.4,
                    "scope_creep_rate": 0.4,
                },
                "feature_values": {
                    "ghost_rate": list(range(200)),
                    "on_time_rate": list(range(200)),
                    "paid_in_full_rate": list(range(200)),
                    "scope_creep_rate": list(range(200)),
                    "avg_days_late": list(range(200)),
                    "subject_role": [0] * 200,
                },
                "label_values": label_values,
                "rates": {
                    "on_time": 0.7,
                    "ghost": 0.08,
                    "paid_in_full": 0.9,
                    "scope_creep": 0.2,
                },
                "label_terms": {"ghost_rate", "on_time_rate"},
            }
        },
    }


def _seeds(*, role="freelancer"):
    return [_seed(number, role=role) for number in range(5)]


def _window(row_id: str, at: datetime):
    return {"row_id": row_id, "recordedAt": at}


def test_leakage_gate_fails_overlapping_event_windows():
    now = datetime(2026, 1, 1)
    result = judge_leakage_windows(
        {"profile-1": {"feature_rows": [_window("shared", now)], "label_rows": [_window("shared", now)]}}
    )
    assert result.status is GateStatus.FAIL


def test_leakage_gate_passes_cleanly_separated_event_windows():
    now = datetime(2026, 1, 1)
    result = judge_leakage_windows(
        {
            "profile-1": {
                "feature_rows": [_window("feature", now)],
                "label_rows": [_window("label", now + timedelta(seconds=1))],
            }
        }
    )
    assert result.status is GateStatus.PASS


def test_leakage_gate_fails_disjoint_windows_when_label_predates_a_feature():
    now = datetime(2026, 1, 1)
    result = judge_leakage_windows(
        {
            "profile-1": {
                "feature_rows": [_window("early", now), _window("late", now + timedelta(days=2))],
                "label_rows": [_window("label", now + timedelta(days=1))],
            }
        }
    )
    assert result.status is GateStatus.FAIL


def test_a1_orchestrator_never_passes_leakage_without_a4_label_builder():
    result = evaluate_all_gates(_seeds())
    assert result["leakage"].status is GateStatus.NOT_EVALUABLE


def test_every_statistical_gate_can_pass_on_adequate_healthy_measurements():
    result = evaluate_all_gates(_seeds())
    assert {name: gate.status for name, gate in result.items() if name != "leakage"} == {
        "archetype_recoverability": GateStatus.PASS,
        "conditional_independence": GateStatus.PASS,
        "degeneracy": GateStatus.PASS,
        "plausibility": GateStatus.PASS,
        "label_composition": GateStatus.PASS,
    }


def test_recoverability_fails_low_separation_and_exempts_subject_role():
    seeds = _seeds()
    for seed in seeds:
        seed["roles"]["freelancer"]["feature_separations"]["on_time_rate"] = 0.49
    result = judge_archetype_recoverability(seeds)
    assert result.status is GateStatus.FAIL
    assert "on_time_rate" in result.failures
    assert "subject_role" not in result.failures


def test_conditional_independence_fails_a_flat_paid_in_full_term():
    seeds = _seeds()
    for seed in seeds:
        seed["roles"]["freelancer"]["conditional_term_separations"]["paid_in_full_rate"] = 0.0
        seed["roles"]["freelancer"]["label_terms"] = {"ghost_rate", "paid_in_full_rate"}
    result = judge_conditional_independence(seeds)
    assert result.status is GateStatus.FAIL
    assert "paid_in_full_rate" in result.failures


def test_feature_degeneracy_fails_a_value_held_by_more_than_half_and_exempts_discriminator():
    seeds = _seeds()
    for seed in seeds:
        seed["roles"]["freelancer"]["feature_values"]["on_time_rate"] = [0] * 101 + list(range(99))
    result = judge_feature_degeneracy(seeds)
    assert result.status is GateStatus.FAIL
    assert "on_time_rate" in result.failures
    assert "subject_role" not in result.failures


def test_label_degeneracy_fails_a_29_point_4_percent_atom():
    seeds = _seeds()
    values = [0] * 294 + list(range(1, 707))
    for seed in seeds:
        seed["roles"]["freelancer"]["label_values"] = values
    result = judge_label_degeneracy(seeds)
    assert result.status is GateStatus.FAIL
    assert "largest atom" in result.failures["freelancer"][0]


def test_plausibility_fails_a_98_point_7_percent_late_rate():
    seeds = _seeds()
    for seed in seeds:
        seed["roles"]["freelancer"]["rates"]["on_time"] = 0.013
    result = judge_plausibility(seeds)
    assert result.status is GateStatus.FAIL
    assert "on_time" in result.failures


def test_label_composition_fails_an_omitted_separation_one_feature():
    seeds = _seeds()
    for seed in seeds:
        seed["roles"]["freelancer"]["feature_separations"]["avg_days_late"] = 1.0
    result = judge_label_composition(seeds)
    assert result.status is GateStatus.FAIL
    assert "avg_days_late" in result.failures


def test_label_composition_exempts_only_its_predeclared_collinear_sibling():
    seeds = _seeds()
    for seed in seeds:
        features = seed["roles"]["freelancer"]["feature_separations"]
        features["avg_days_late"] = 1.0
        features["paid_in_full_rate"] = 1.0
    result = judge_label_composition(
        seeds,
        exemptions=[CollinearityExemption("avg_days_late", "on_time_rate")],
    )
    assert result.status is GateStatus.FAIL
    assert "paid_in_full_rate" in result.failures
    assert "avg_days_late" not in result.failures


def test_label_composition_rejects_a_post_hoc_collinearity_exemption():
    with pytest.raises(ValueError, match="predeclared"):
        judge_label_composition(
            _seeds(),
            exemptions=[CollinearityExemption("avg_days_late", "on_time_rate", predeclared=False)],
        )


def test_statistical_gates_are_not_evaluable_below_200_per_archetype_not_pass():
    seeds = _seeds()
    for seed in seeds:
        seed["roles"]["freelancer"]["scoreable_by_archetype"]["bad-actor"] = 199
    result = judge_archetype_recoverability(seeds)
    assert result.status is GateStatus.NOT_EVALUABLE


def test_statistical_gates_require_at_least_five_seeds_and_report_ranges():
    assert judge_plausibility(_seeds()[:4]).status is GateStatus.NOT_EVALUABLE
    result = judge_plausibility(_seeds())
    assert result.status is GateStatus.PASS
    assert result.ranges["freelancer.on_time"] == (0.7, 0.7)
