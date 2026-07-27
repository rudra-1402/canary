import random

from trust_score.config import TrustScoreConfig
from trust_score.explain import build_explainer, explain_profile
from trust_score.model import train_model


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


def _trained_model():
    rng = random.Random(42)
    features, labels = [], []
    for _ in range(30):
        features.append(_synthetic_features(rng, True))
        labels.append("high")
        features.append(_synthetic_features(rng, False))
        labels.append("low")
        features.append(_synthetic_med_features(rng))
        labels.append("med")
    return train_model(features, labels, TrustScoreConfig())


def test_explain_profile_returns_top_signals_summing_toward_the_model():
    model = _trained_model()
    explainer = build_explainer(model)
    reliable_features = _synthetic_features(random.Random(1), reliable=True)

    signals = explain_profile(explainer, reliable_features)

    assert 1 <= len(signals) <= 3
    for signal in signals:
        assert signal["source"] == "structured-data"
        assert signal["direction"] in ("favorable", "unfavorable")
        assert isinstance(signal["value"], float)
        assert signal["name"]


def test_reliable_and_unreliable_profiles_get_different_dominant_directions():
    model = _trained_model()
    explainer = build_explainer(model)
    reliable_signals = explain_profile(explainer, _synthetic_features(random.Random(2), True))
    unreliable_signals = explain_profile(explainer, _synthetic_features(random.Random(2), False))

    reliable_favorable = sum(1 for s in reliable_signals if s["direction"] == "favorable")
    unreliable_favorable = sum(1 for s in unreliable_signals if s["direction"] == "favorable")
    assert reliable_favorable > unreliable_favorable
