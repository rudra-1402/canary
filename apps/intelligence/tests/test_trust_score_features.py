from datetime import datetime, timedelta

from trust_score.config import TrustScoreConfig
from trust_score.features import compute_features
from trust_score.model import is_cold_start

NOW = datetime(2026, 7, 1)


def _outcome(
    days_ago,
    paid_in_full=True,
    days_late=0,
    ghosted=False,
    observed=True,
    scope_creep=False,
    ended_as="completed",
    subject_role="freelancer",
):
    return {
        "recordedAt": NOW - timedelta(days=days_ago),
        "paidInFull": paid_in_full,
        "daysLate": days_late,
        "ghosted": ghosted,
        "observed": observed,
        "scopeCreepOccurred": scope_creep,
        "endedAs": ended_as,
        "subjectRole": subject_role,
    }


def _review(days_ago, rating):
    return {"createdAt": NOW - timedelta(days=days_ago), "rating": rating}


def test_no_history_returns_neutral_defaults():
    config = TrustScoreConfig()
    features = compute_features([], [], NOW, config)
    assert features["engagement_count"] == 0
    assert features["paid_in_full_rate"] == 0.5
    assert features["avg_review_rating"] == 3.0
    assert features["review_count"] == 0


def test_static_aggregates_over_known_outcomes():
    config = TrustScoreConfig()
    outcomes = [
        _outcome(days_ago=10, paid_in_full=True, days_late=0),
        _outcome(days_ago=20, paid_in_full=False, days_late=5),
        _outcome(days_ago=30, paid_in_full=True, days_late=0, ghosted=True, ended_as="ghosted"),
    ]
    reviews = [_review(10, 5), _review(20, 3)]
    features = compute_features(outcomes, reviews, NOW, config)
    assert features["engagement_count"] == 3
    assert features["paid_in_full_rate"] == 2 / 3
    assert features["ghost_rate"] == 1 / 3
    assert features["completion_rate"] == 2 / 3  # first two default to "completed", third is ghosted
    assert features["on_time_rate"] == 0.5  # of the 2 non-ghosted: 1 on-time, 1 late
    assert features["avg_days_late"] == 2.5  # mean of [0, 5] over non-ghosted
    assert features["avg_review_rating"] == 4.0
    assert features["review_count"] == 2


def test_no_lookahead_excludes_outcomes_and_reviews_after_as_of():
    config = TrustScoreConfig()
    outcomes = [_outcome(days_ago=5), _outcome(days_ago=-5)]  # second is in the "future" relative to NOW
    reviews = [_review(5, 5), _review(-5, 1)]
    features = compute_features(outcomes, reviews, NOW, config)
    assert features["engagement_count"] == 1
    assert features["review_count"] == 1
    assert features["avg_review_rating"] == 5.0


def test_recency_weighted_on_time_rate_favors_recent_behavior():
    config = TrustScoreConfig()
    # Old late payments, recent on-time -- recency weighting should push the
    # weighted rate above the plain (unweighted) on_time_rate of 0.5.
    outcomes = [
        _outcome(days_ago=500, days_late=10),
        _outcome(days_ago=400, days_late=10),
        _outcome(days_ago=5, days_late=0),
        _outcome(days_ago=2, days_late=0),
    ]
    features = compute_features(outcomes, [], NOW, config)
    assert features["on_time_rate"] == 0.5
    assert features["recency_weighted_on_time_rate"] > 0.5


def test_trend_slope_positive_when_recent_half_better_than_older_half():
    config = TrustScoreConfig()
    outcomes = [
        _outcome(days_ago=400, days_late=10),
        _outcome(days_ago=300, days_late=10),
        _outcome(days_ago=20, days_late=0),
        _outcome(days_ago=10, days_late=0),
    ]
    features = compute_features(outcomes, [], NOW, config)
    assert features["trend_slope"] > 0


def test_trend_slope_is_zero_with_fewer_than_two_non_ghosted_outcomes():
    config = TrustScoreConfig()
    features = compute_features([_outcome(days_ago=10)], [], NOW, config)
    assert features["trend_slope"] == 0.0


def test_no_history_has_neutral_temporal_defaults():
    config = TrustScoreConfig()
    features = compute_features([], [], NOW, config)
    assert features["recency_weighted_on_time_rate"] == 0.5
    assert features["trend_slope"] == 0.0


def test_not_observed_outcome_changes_no_conduct_rate():
    config = TrustScoreConfig()
    observed_outcomes = [
        _outcome(days_ago=10, paid_in_full=True, days_late=0, scope_creep=False),
        _outcome(days_ago=20, paid_in_full=False, days_late=5, scope_creep=True),
    ]
    not_observed = _outcome(
        days_ago=5,
        paid_in_full=None,
        days_late=None,
        ghosted=False,
        observed=False,
        scope_creep=None,
        ended_as="ghosted",
    )

    before = compute_features(observed_outcomes, [], NOW, config)
    after = compute_features([*observed_outcomes, not_observed], [], NOW, config)

    for name in [
        "engagement_count",
        "paid_in_full_rate",
        "on_time_rate",
        "avg_days_late",
        "ghost_rate",
        "scope_creep_rate",
        "completion_rate",
        "recency_weighted_on_time_rate",
        "trend_slope",
    ]:
        assert after[name] == before[name]


def test_not_observed_outcomes_are_insufficient_history():
    config = TrustScoreConfig()
    features = compute_features(
        [
            _outcome(days_ago=10, observed=False, paid_in_full=None, days_late=None, scope_creep=None),
            _outcome(days_ago=20, observed=False, paid_in_full=None, days_late=None, scope_creep=None),
            _outcome(days_ago=30, observed=False, paid_in_full=None, days_late=None, scope_creep=None),
        ],
        [],
        NOW,
        config,
    )

    assert features["engagement_count"] == 0
    assert is_cold_start(features, config) is True


def test_null_days_late_is_not_counted_as_on_time():
    features = compute_features(
        [_outcome(days_ago=10, days_late=None, paid_in_full=None)], [], NOW, TrustScoreConfig()
    )

    assert features["on_time_rate"] != 1.0


def test_same_engagement_produces_role_aware_feature_vectors():
    config = TrustScoreConfig()
    freelancer_features = compute_features(
        [
            _outcome(
                days_ago=10,
                paid_in_full=None,
                days_late=4,
                scope_creep=None,
                subject_role="freelancer",
            )
        ],
        [],
        NOW,
        config,
    )
    client_features = compute_features(
        [
            _outcome(
                days_ago=10,
                paid_in_full=True,
                days_late=None,
                scope_creep=False,
                subject_role="client",
            )
        ],
        [],
        NOW,
        config,
    )

    assert freelancer_features != client_features


def test_features_expose_observed_engagement_count():
    features = compute_features(
        [
            _outcome(days_ago=10, observed=True),
            _outcome(days_ago=20, observed=False, paid_in_full=None, days_late=None, scope_creep=None),
        ],
        [],
        NOW,
        TrustScoreConfig(),
    )

    assert features["observed_engagement_count"] == 1
