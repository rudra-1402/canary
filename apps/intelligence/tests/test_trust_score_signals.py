import pytest

from trust_score.signals import build_risk_signals


def _freelancer_features(*, ghost_rate, on_time_rate):
    return {
        "subject_role": 0,
        "ghost_rate": ghost_rate,
        "completion_rate": 0.9,
        "avg_review_rating": 4.0,
        "observed_engagement_count": 10,
        "on_time_rate": on_time_rate,
        "avg_days_late": 0.0,
        "recency_weighted_on_time_rate": on_time_rate,
        "paid_in_full_rate": float("nan"),
        "scope_creep_rate": float("nan"),
        "trend_slope": 0.0,
    }


def _client_features(*, ghost_rate, paid_in_full_rate, scope_creep_rate):
    return {
        "subject_role": 1,
        "ghost_rate": ghost_rate,
        "completion_rate": 0.9,
        "avg_review_rating": 4.0,
        "observed_engagement_count": 10,
        "on_time_rate": float("nan"),
        "avg_days_late": float("nan"),
        "recency_weighted_on_time_rate": float("nan"),
        "paid_in_full_rate": paid_in_full_rate,
        "scope_creep_rate": scope_creep_rate,
        "trend_slope": 0.0,
    }


def test_freelancer_signals_carry_the_feature_value_behind_each_one():
    signals = build_risk_signals(_freelancer_features(ghost_rate=0.3, on_time_rate=0.2), "freelancer")

    by_name = {signal["name"]: signal for signal in signals}
    assert set(by_name) == {"ghost-rate", "on-time-rate"}
    assert by_name["ghost-rate"]["value"] == 0.3
    assert by_name["on-time-rate"]["value"] == 0.2
    for signal in signals:
        assert signal["source"] == "structured-data"


def test_freelancer_high_ghost_rate_and_poor_on_time_rate_are_unfavorable():
    signals = build_risk_signals(_freelancer_features(ghost_rate=0.3, on_time_rate=0.2), "freelancer")
    by_name = {signal["name"]: signal for signal in signals}

    assert by_name["ghost-rate"]["direction"] == "unfavorable"
    assert by_name["on-time-rate"]["direction"] == "unfavorable"


def test_freelancer_low_ghost_rate_and_strong_on_time_rate_are_favorable():
    signals = build_risk_signals(_freelancer_features(ghost_rate=0.01, on_time_rate=0.95), "freelancer")
    by_name = {signal["name"]: signal for signal in signals}

    assert by_name["ghost-rate"]["direction"] == "favorable"
    assert by_name["on-time-rate"]["direction"] == "favorable"


def test_client_signals_cover_ghost_paid_in_full_and_scope_creep():
    signals = build_risk_signals(
        _client_features(ghost_rate=0.05, paid_in_full_rate=0.4, scope_creep_rate=0.6),
        "client",
    )
    by_name = {signal["name"]: signal for signal in signals}

    assert set(by_name) == {"ghost-rate", "paid-in-full-rate", "scope-creep-rate"}
    assert by_name["paid-in-full-rate"]["value"] == 0.4
    assert by_name["paid-in-full-rate"]["direction"] == "unfavorable"
    assert by_name["scope-creep-rate"]["value"] == 0.6
    assert by_name["scope-creep-rate"]["direction"] == "unfavorable"


def test_client_low_scope_creep_and_high_paid_in_full_are_favorable():
    signals = build_risk_signals(
        _client_features(ghost_rate=0.02, paid_in_full_rate=0.97, scope_creep_rate=0.05),
        "client",
    )
    by_name = {signal["name"]: signal for signal in signals}

    assert by_name["paid-in-full-rate"]["direction"] == "favorable"
    assert by_name["scope-creep-rate"]["direction"] == "favorable"


def test_unsupported_role_is_rejected():
    with pytest.raises(ValueError, match="role"):
        build_risk_signals(_freelancer_features(ghost_rate=0.1, on_time_rate=0.5), "admin")


def test_signals_are_never_empty_for_either_role():
    # Regression guard for Part B.0: an eligible scored snapshot with zero risk
    # signals makes trustScore.service.js throw for every real score.
    assert build_risk_signals(_freelancer_features(ghost_rate=0.1, on_time_rate=0.5), "freelancer")
    assert build_risk_signals(
        _client_features(ghost_rate=0.1, paid_in_full_rate=0.5, scope_creep_rate=0.5), "client"
    )
