from datetime import datetime, timedelta
from math import isnan

import pytest

from trust_score.backfill import backfill_feature_rows, month_boundary_dates, score_and_explain
from trust_score.config import TrustScoreConfig
from trust_score.model import ModelExecutionUnavailableError

NOW = datetime(2026, 7, 1)


def _outcome(recorded_at, *, subject_role, days_late=None, paid_in_full=None, scope_creep=None):
    return {
        "recordedAt": recorded_at,
        "observed": True,
        "ghosted": False,
        "daysLate": days_late,
        "paidInFull": paid_in_full,
        "scopeCreepOccurred": scope_creep,
        "endedAs": "completed",
        "subjectRole": subject_role,
    }


def test_month_boundary_dates_spans_full_timeline_ending_at_now():
    boundaries = month_boundary_dates(18, now=NOW)
    assert len(boundaries) == 19
    assert boundaries[0] == NOW - timedelta(days=30 * 18)
    assert boundaries[-1] == NOW


def test_backfill_feature_rows_carry_encoded_role_and_superset_features():
    snapshots = backfill_feature_rows(
        [_outcome(datetime(2026, 1, 1), subject_role="client", paid_in_full=True, scope_creep=False)],
        [],
        "client",
        TrustScoreConfig(timeline_months=1),
        1,
        now=NOW,
    )

    assert len(snapshots) == 2
    for snapshot in snapshots:
        assert snapshot["subject_role"] == 1
        assert snapshot["features"]["subject_role"] == 1
        assert isnan(snapshot["features"]["on_time_rate"])


def test_backfill_month5_score_unchanged_when_month8_data_is_deleted():
    """Historical feature rows must be independent of data after their boundary."""
    config = TrustScoreConfig(timeline_months=18)
    boundaries = month_boundary_dates(18, now=NOW)
    month5_boundary = boundaries[5]
    month8_boundary = boundaries[8]
    outcomes_before_month5 = [
        _outcome(boundaries[1], subject_role="freelancer", days_late=0),
        _outcome(boundaries[2], subject_role="freelancer", days_late=5),
        _outcome(boundaries[3], subject_role="freelancer", days_late=0),
    ]
    outcome_at_month8 = _outcome(month8_boundary, subject_role="freelancer", days_late=45)

    snapshots_full = backfill_feature_rows(
        [*outcomes_before_month5, outcome_at_month8],
        [],
        "freelancer",
        config,
        18,
        now=NOW,
    )
    snapshots_truncated = backfill_feature_rows(
        outcomes_before_month5,
        [],
        "freelancer",
        config,
        18,
        now=NOW,
    )
    snapshot_full_month5 = next(
        snapshot for snapshot in snapshots_full if snapshot["generatedAt"] == month5_boundary
    )
    snapshot_truncated_month5 = next(
        snapshot for snapshot in snapshots_truncated if snapshot["generatedAt"] == month5_boundary
    )

    assert snapshot_full_month5["generatedAt"] == snapshot_truncated_month5["generatedAt"]
    assert snapshot_full_month5["subject_role"] == snapshot_truncated_month5["subject_role"]
    assert set(snapshot_full_month5["features"]) == set(snapshot_truncated_month5["features"])
    for name, full_value in snapshot_full_month5["features"].items():
        truncated_value = snapshot_truncated_month5["features"][name]
        if isinstance(full_value, float) and isnan(full_value):
            assert isnan(truncated_value)
        else:
            assert full_value == truncated_value


def test_backfill_profile_produces_one_snapshot_per_month_boundary():
    config = TrustScoreConfig(timeline_months=18)
    boundaries = month_boundary_dates(18, now=NOW)
    snapshots = backfill_feature_rows(
        [_outcome(datetime(2026, 1, 1), subject_role="client", paid_in_full=True, scope_creep=False)],
        [],
        "client",
        config,
        18,
        now=NOW,
    )

    assert len(snapshots) == len(boundaries) == 19
    assert [snapshot["generatedAt"] for snapshot in snapshots] == boundaries
    for snapshot in snapshots:
        assert snapshot["subject_role"] == 1
        assert snapshot["features"]["subject_role"] == 1


def test_scoring_backfill_fails_loudly_until_a4():
    with pytest.raises(ModelExecutionUnavailableError, match="A4"):
        score_and_explain(object(), object(), {}, TrustScoreConfig())
