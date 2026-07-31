import random
from datetime import datetime, timedelta

from trust_score.backfill import backfill_profile, month_boundary_dates, score_and_explain
from trust_score.config import TrustScoreConfig
from trust_score.explain import build_explainer
from trust_score.model import train_model

NOW = datetime(2026, 7, 1)


def _synthetic_features(rng, reliable: bool):
    base = 0.9 if reliable else 0.1

    def noise():
        return max(0.0, min(1.0, base + rng.uniform(-0.03, 0.03)))

    return {
        "paid_in_full_rate": noise(),
        "on_time_rate": noise(),
        "avg_days_late": 0.0 if reliable else 20.0,
        "ghost_rate": 1 - noise() if not reliable else 1 - base,
        "scope_creep_rate": 1 - noise(),
        "completion_rate": noise(),
        "avg_review_rating": 4.8 if reliable else 1.5,
        "recency_weighted_on_time_rate": noise(),
        "trend_slope": 0.0,
    }


def _synthetic_med_features(rng):
    def noise():
        return max(0.0, min(1.0, 0.5 + rng.uniform(-0.03, 0.03)))

    return {
        "paid_in_full_rate": noise(),
        "on_time_rate": noise(),
        "avg_days_late": 7.0,
        "ghost_rate": noise() * 0.2,
        "scope_creep_rate": noise() * 0.2,
        "completion_rate": noise(),
        "avg_review_rating": 3.0,
        "recency_weighted_on_time_rate": noise(),
        "trend_slope": 0.0,
    }


def _trained_model_and_explainer():
    rng = random.Random(42)
    features, labels = [], []
    for _ in range(30):
        features.append(_synthetic_features(rng, True))
        labels.append("high")
        features.append(_synthetic_features(rng, False))
        labels.append("low")
        features.append(_synthetic_med_features(rng))
        labels.append("med")
    model = train_model(features, labels, TrustScoreConfig())
    return model, build_explainer(model)


def _outcome(recorded_at, days_late=0, ghosted=False):
    return {
        "recordedAt": recorded_at,
        "paidInFull": not ghosted,
        "daysLate": days_late,
        "scopeCreepOccurred": False,
        "ghosted": ghosted,
        "endedAs": "ghosted" if ghosted else "completed",
    }


def test_month_boundary_dates_spans_full_timeline_ending_at_now():
    boundaries = month_boundary_dates(18, now=NOW)
    assert len(boundaries) == 19
    assert boundaries[0] == NOW - timedelta(days=30 * 18)
    assert boundaries[-1] == NOW


def test_score_and_explain_states_insufficient_history_below_threshold():
    """Absence must not be expressed as a score-shaped value: the keys are gone,
    not None. A 50 on the same 0-100 scale a real score uses is what kept this
    defect invisible for a week."""
    config = TrustScoreConfig(min_engagements_for_scoring=3)
    model, explainer = _trained_model_and_explainer()
    features = {"engagement_count": 1, **_synthetic_features(random.Random(1), True)}
    snapshot = score_and_explain(model, explainer, features, config)
    assert snapshot["status"] == "insufficient-history"
    assert "score" not in snapshot
    assert "level" not in snapshot
    assert snapshot["riskSignals"] == []


def test_score_and_explain_uses_model_above_threshold():
    config = TrustScoreConfig(min_engagements_for_scoring=3)
    model, explainer = _trained_model_and_explainer()
    features = {"engagement_count": 10, **_synthetic_features(random.Random(1), True)}
    snapshot = score_and_explain(model, explainer, features, config)
    assert snapshot["status"] == "scored"
    assert snapshot["level"] in ("low", "med", "high")
    assert 0 <= snapshot["score"] <= 100
    assert len(snapshot["riskSignals"]) >= 1
    assert snapshot["riskSignals"][0]["name"] != "insufficient-history"


def test_backfill_month5_score_unchanged_when_month8_data_is_deleted():
    """The design spec's explicit no-lookahead QC check: deleting future
    Outcome rows must not change a historical snapshot's score."""
    config = TrustScoreConfig(timeline_months=18, min_engagements_for_scoring=1)
    model, explainer = _trained_model_and_explainer()
    boundaries = month_boundary_dates(18, now=NOW)
    month5_boundary = boundaries[5]
    month8_boundary = boundaries[8]

    outcomes_before_month5 = [
        _outcome(boundaries[1]),
        _outcome(boundaries[2]),
        _outcome(boundaries[3]),
    ]
    outcome_at_month8 = _outcome(month8_boundary, days_late=45)

    full_history = outcomes_before_month5 + [outcome_at_month8]
    truncated_history = outcomes_before_month5

    snapshots_full = backfill_profile(full_history, [], model, explainer, config, 18, now=NOW)
    snapshots_truncated = backfill_profile(truncated_history, [], model, explainer, config, 18, now=NOW)

    snapshot_full_month5 = next(
        snapshot for snapshot in snapshots_full if snapshot["generatedAt"] == month5_boundary
    )
    snapshot_truncated_month5 = next(
        snapshot for snapshot in snapshots_truncated if snapshot["generatedAt"] == month5_boundary
    )
    assert snapshot_full_month5["score"] == snapshot_truncated_month5["score"]
    assert snapshot_full_month5["level"] == snapshot_truncated_month5["level"]


def test_backfill_profile_produces_one_snapshot_per_month_boundary():
    config = TrustScoreConfig(timeline_months=18, min_engagements_for_scoring=1)
    model, explainer = _trained_model_and_explainer()
    outcomes = [_outcome(datetime(2026, 1, 1))]
    snapshots = backfill_profile(outcomes, [], model, explainer, config, 18, now=NOW)
    assert len(snapshots) == 19
    # Boundaries before the single outcome are legitimately cold-start, so the shape
    # assertion is per-status: every snapshot states one, and only scored ones carry a number.
    for snapshot in snapshots:
        assert "generatedAt" in snapshot
        assert snapshot["status"] in ("scored", "insufficient-history")
        if snapshot["status"] == "scored":
            assert "score" in snapshot and "level" in snapshot
        else:
            assert "score" not in snapshot and "level" not in snapshot
    assert {s["status"] for s in snapshots} == {"scored", "insufficient-history"}
