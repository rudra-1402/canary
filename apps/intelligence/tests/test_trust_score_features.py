from datetime import datetime, timedelta
from math import isnan

import pytest

from trust_score.config import TrustScoreConfig
from trust_score.features import FEATURE_NAMES, compute_features
from trust_score.model import is_cold_start

NOW = datetime(2026, 7, 1)


def _outcome(
    days_ago,
    *,
    subject_role,
    paid_in_full=None,
    days_late=None,
    ghosted=False,
    observed=True,
    scope_creep=None,
    ended_as="completed",
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


def test_freelancer_feature_vector_carries_superset_with_client_columns_missing():
    features = compute_features(
        [_outcome(10, subject_role="freelancer", days_late=0)],
        [_review(5, 5)],
        "freelancer",
        NOW,
        TrustScoreConfig(),
    )

    assert set(features) >= set(FEATURE_NAMES)
    assert features["subject_role"] == 0
    assert isnan(features["paid_in_full_rate"])
    assert isnan(features["scope_creep_rate"])
    assert features["on_time_rate"] == 1.0
    assert features["observed_engagement_count"] == 1


def test_client_feature_vector_carries_superset_with_freelancer_columns_missing():
    features = compute_features(
        [_outcome(10, subject_role="client", paid_in_full=True, scope_creep=False)],
        [_review(5, 4)],
        "client",
        NOW,
        TrustScoreConfig(),
    )

    assert set(features) >= set(FEATURE_NAMES)
    assert features["subject_role"] == 1
    for column in ("on_time_rate", "avg_days_late", "recency_weighted_on_time_rate"):
        assert isnan(features[column])
    assert features["paid_in_full_rate"] == 1.0
    assert features["scope_creep_rate"] == 0.0


def test_subject_role_encoding_is_deterministic_even_with_no_history():
    freelancer = compute_features([], [], "freelancer", NOW, TrustScoreConfig())
    client = compute_features([], [], "client", NOW, TrustScoreConfig())

    assert freelancer["subject_role"] == 0
    assert client["subject_role"] == 1
    assert freelancer["engagement_count"] == 0
    assert is_cold_start(freelancer, TrustScoreConfig()) is True


def test_not_observed_outcomes_do_not_change_conduct_or_observation_count():
    config = TrustScoreConfig()
    observed = [_outcome(10, subject_role="freelancer", days_late=0)]
    not_observed = _outcome(5, subject_role="freelancer", observed=False, ended_as="ghosted")

    before = compute_features(observed, [], "freelancer", NOW, config)
    after = compute_features([*observed, not_observed], [], "freelancer", NOW, config)

    for name in ("engagement_count", "observed_engagement_count", "ghost_rate", "on_time_rate"):
        assert after[name] == before[name]


@pytest.mark.parametrize(
    ("subject_role", "past_conduct", "future_conduct", "rate_name"),
    [
        ("freelancer", {"days_late": 0}, {"days_late": 10}, "on_time_rate"),
        (
            "client",
            {"paid_in_full": True, "scope_creep": False},
            {"paid_in_full": False, "scope_creep": True},
            "paid_in_full_rate",
        ),
    ],
)
def test_no_lookahead_excludes_outcomes_and_reviews_after_as_of(
    subject_role, past_conduct, future_conduct, rate_name
):
    config = TrustScoreConfig()
    outcomes = [
        _outcome(5, subject_role=subject_role, **past_conduct),
        _outcome(-5, subject_role=subject_role, **future_conduct),
    ]
    reviews = [_review(5, 5), _review(-5, 1)]

    features = compute_features(outcomes, reviews, subject_role, NOW, config)

    assert features["engagement_count"] == 1
    assert features["observed_engagement_count"] == 1
    assert features["review_count"] == 1
    assert features["avg_review_rating"] == 5.0
    assert features[rate_name] == 1.0


@pytest.mark.parametrize(
    ("subject_role", "outcomes", "applicable_assertions", "inapplicable_columns"),
    [
        (
            "freelancer",
            [
                _outcome(10, subject_role="freelancer", days_late=0),
                _outcome(20, subject_role="freelancer", days_late=5),
                _outcome(
                    30,
                    subject_role="freelancer",
                    days_late=None,
                    ghosted=True,
                    ended_as="ghosted",
                ),
            ],
            {"on_time_rate": 0.5, "avg_days_late": 2.5},
            ("paid_in_full_rate", "scope_creep_rate"),
        ),
        (
            "client",
            [
                _outcome(10, subject_role="client", paid_in_full=True, scope_creep=False),
                _outcome(20, subject_role="client", paid_in_full=False, scope_creep=True),
                _outcome(30, subject_role="client", ghosted=True, ended_as="ghosted"),
            ],
            {"paid_in_full_rate": 0.5, "scope_creep_rate": 0.5},
            ("on_time_rate", "avg_days_late"),
        ),
    ],
)
def test_static_aggregates_over_known_outcomes(
    subject_role, outcomes, applicable_assertions, inapplicable_columns
):
    config = TrustScoreConfig()
    reviews = [_review(10, 5), _review(20, 3)]
    features = compute_features(outcomes, reviews, subject_role, NOW, config)

    assert features["engagement_count"] == 3
    assert features["observed_engagement_count"] == 3
    assert features["ghost_rate"] == 1 / 3
    assert features["completion_rate"] == 2 / 3
    assert features["avg_review_rating"] == 4.0
    assert features["review_count"] == 2
    for name, expected in applicable_assertions.items():
        assert features[name] == expected
    for name in inapplicable_columns:
        assert isnan(features[name])


def test_null_days_late_is_not_counted_as_on_time():
    features = compute_features(
        [_outcome(10, subject_role="freelancer", days_late=None)],
        [],
        "freelancer",
        NOW,
        TrustScoreConfig(),
    )

    assert features["on_time_rate"] != 1.0


def test_recency_weighted_on_time_rate_favors_recent_behavior():
    features = compute_features(
        [
            _outcome(500, subject_role="freelancer", days_late=10),
            _outcome(400, subject_role="freelancer", days_late=10),
            _outcome(5, subject_role="freelancer", days_late=0),
            _outcome(2, subject_role="freelancer", days_late=0),
        ],
        [],
        "freelancer",
        NOW,
        TrustScoreConfig(),
    )

    assert features["on_time_rate"] == 0.5
    assert features["recency_weighted_on_time_rate"] > 0.5


@pytest.mark.parametrize(
    ("subject_role", "outcomes"),
    [
        (
            "freelancer",
            [
                _outcome(400, subject_role="freelancer", days_late=10),
                _outcome(300, subject_role="freelancer", days_late=10),
                _outcome(20, subject_role="freelancer", days_late=0),
                _outcome(10, subject_role="freelancer", days_late=0),
            ],
        ),
        (
            "client",
            [
                _outcome(400, subject_role="client", paid_in_full=False, scope_creep=False),
                _outcome(300, subject_role="client", paid_in_full=False, scope_creep=False),
                _outcome(20, subject_role="client", paid_in_full=True, scope_creep=False),
                _outcome(10, subject_role="client", paid_in_full=True, scope_creep=False),
            ],
        ),
    ],
)
def test_trend_slope_positive_when_recent_half_better_than_older_half(subject_role, outcomes):
    features = compute_features(outcomes, [], subject_role, NOW, TrustScoreConfig())

    assert features["trend_slope"] == 1.0


@pytest.mark.parametrize(
    ("subject_role", "outcome"),
    [
        ("freelancer", _outcome(10, subject_role="freelancer", days_late=0)),
        ("client", _outcome(10, subject_role="client", paid_in_full=True, scope_creep=False)),
    ],
)
def test_trend_slope_is_zero_with_fewer_than_two_non_ghosted_outcomes(subject_role, outcome):
    features = compute_features([outcome], [], subject_role, NOW, TrustScoreConfig())

    assert features["trend_slope"] == 0.0


def test_trend_slope_uses_on_time_for_freelancers_and_payment_for_clients():
    freelancer = compute_features(
        [
            _outcome(400, subject_role="freelancer", days_late=10),
            _outcome(300, subject_role="freelancer", days_late=10),
            _outcome(20, subject_role="freelancer", days_late=0),
            _outcome(10, subject_role="freelancer", days_late=0),
        ],
        [],
        "freelancer",
        NOW,
        TrustScoreConfig(),
    )
    client = compute_features(
        [
            _outcome(400, subject_role="client", paid_in_full=False, scope_creep=False),
            _outcome(300, subject_role="client", paid_in_full=False, scope_creep=False),
            _outcome(20, subject_role="client", paid_in_full=True, scope_creep=False),
            _outcome(10, subject_role="client", paid_in_full=True, scope_creep=False),
        ],
        [],
        "client",
        NOW,
        TrustScoreConfig(),
    )

    assert freelancer["trend_slope"] == 1.0
    assert client["trend_slope"] == 1.0
    assert isnan(client["on_time_rate"])
    assert isnan(freelancer["paid_in_full_rate"])
