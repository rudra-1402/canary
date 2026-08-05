from datetime import datetime, timedelta

from quality.gates import GateStatus, judge_temporal_label_leakage
from trust_score.config import TrustScoreConfig
from trust_score.labels import build_temporal_example


def _outcome(day, *, ghosted=False, days_late=0, paid=True, scope=False):
    return {
        "_id": f"outcome-{day}",
        "recordedAt": datetime(2026, 1, 1) + timedelta(days=day),
        "observed": True,
        "ghosted": ghosted,
        "daysLate": days_late,
        "paidInFull": paid,
        "scopeCreepOccurred": scope,
        "endedAs": "completed",
    }


def test_temporal_split_produces_disjoint_strictly_ordered_windows():
    example = build_temporal_example(
        "profile-1", "freelancer", [_outcome(day) for day in range(4)], [], TrustScoreConfig()
    )

    assert {row["row_id"] for row in example["feature_rows"]}.isdisjoint(
        row["row_id"] for row in example["label_rows"]
    )
    assert max(row["recordedAt"] for row in example["feature_rows"]) < min(
        row["recordedAt"] for row in example["label_rows"]
    )


def test_label_uses_only_post_t_rows():
    example = build_temporal_example(
        "profile-1",
        "freelancer",
        [_outcome(0), _outcome(1), _outcome(2), _outcome(3, ghosted=True, days_late=None)],
        [],
        TrustScoreConfig(),
    )

    assert example["features"]["ghost_rate"] == 0.0
    assert example["label_terms"] == {"ghost": 0.0, "on_time_delivery": 0.5}


def test_profiles_without_three_feature_rows_and_one_future_row_are_excluded():
    assert (
        build_temporal_example(
            "profile-1", "client", [_outcome(day) for day in range(3)], [], TrustScoreConfig()
        )
        is None
    )
    assert (
        build_temporal_example(
            "profile-1",
            "client",
            [_outcome(0), _outcome(1), _outcome(2), _outcome(2)],
            [],
            TrustScoreConfig(),
        )
        is None
    )


def test_gate_1_uses_real_temporal_builder_windows():
    dataset = {
        "profiles": [{"_id": "profile-1", "role": "client"}],
        "outcomes_by_profile": {"profile-1": [_outcome(day) for day in range(4)]},
        "reviews_by_subject": {"profile-1": []},
    }

    assert judge_temporal_label_leakage(dataset, TrustScoreConfig()).status is GateStatus.PASS
