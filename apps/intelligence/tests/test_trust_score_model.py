import random

from trust_score.config import TrustScoreConfig
from trust_score.model import (
    FEATURE_COLUMNS,
    features_to_dataframe,
    is_cold_start,
    score_profile,
    train_model,
)


def _synthetic_features(rng, reliable: bool):
    base = 0.9 if reliable else 0.15

    def noise():
        return max(0.0, min(1.0, base + rng.uniform(-0.05, 0.05)))

    return {
        "engagement_count": 10,
        "paid_in_full_rate": noise(),
        "on_time_rate": noise(),
        "avg_days_late": 0.0 if reliable else 15.0,
        "ghost_rate": 1 - noise() if not reliable else 1 - base,
        "scope_creep_rate": 1 - noise(),
        "completion_rate": noise(),
        "avg_review_rating": 4.5 if reliable else 2.0,
        "review_count": 10,
        "recency_weighted_on_time_rate": noise(),
        "trend_slope": 0.0,
    }


def _synthetic_med_features(rng):
    def noise():
        return max(0.0, min(1.0, 0.5 + rng.uniform(-0.05, 0.05)))

    return {
        "engagement_count": 10,
        "paid_in_full_rate": noise(),
        "on_time_rate": noise(),
        "avg_days_late": 7.0,
        "ghost_rate": noise() * 0.2,
        "scope_creep_rate": noise() * 0.2,
        "completion_rate": noise(),
        "avg_review_rating": 3.0,
        "review_count": 10,
        "recency_weighted_on_time_rate": noise(),
        "trend_slope": 0.0,
    }


def _training_set(n_per_class=30):
    rng = random.Random(42)
    features, labels = [], []
    for _ in range(n_per_class):
        features.append(_synthetic_features(rng, reliable=True))
        labels.append("high")
        features.append(_synthetic_features(rng, reliable=False))
        labels.append("low")
        features.append(_synthetic_med_features(rng))
        labels.append("med")
    return features, labels


def test_features_to_dataframe_uses_only_model_columns():
    df = features_to_dataframe([_synthetic_features(random.Random(1), True)])
    assert list(df.columns) == FEATURE_COLUMNS
    assert "engagement_count" not in df.columns
    assert "review_count" not in df.columns


def test_trained_model_scores_reliable_profile_higher_than_unreliable():
    config = TrustScoreConfig()
    features, labels = _training_set()
    model = train_model(features, labels, config)

    reliable = _synthetic_features(random.Random(99), reliable=True)
    unreliable = _synthetic_features(random.Random(99), reliable=False)
    reliable_result = score_profile(model, reliable)
    unreliable_result = score_profile(model, unreliable)

    assert reliable_result["score"] > unreliable_result["score"]
    assert 0 <= reliable_result["score"] <= 100
    assert reliable_result["level"] in ("low", "med", "high")


def test_is_cold_start_below_threshold():
    config = TrustScoreConfig(min_engagements_for_scoring=3)
    assert is_cold_start({"engagement_count": 0}, config) is True
    assert is_cold_start({"engagement_count": 2}, config) is True
    assert is_cold_start({"engagement_count": 3}, config) is False


def test_model_handles_training_data_missing_one_class():
    config = TrustScoreConfig()
    rng = random.Random(3)
    features, labels = [], []
    for _ in range(20):
        features.append(_synthetic_features(rng, reliable=False))
        labels.append("low")
        features.append(_synthetic_med_features(rng))
        labels.append("med")
    # Deliberately zero "high" examples -- this is the exact real-data
    # condition that crashed score_profile before num_class=3 was forced.
    model = train_model(features, labels, config)
    result = score_profile(model, _synthetic_features(rng, reliable=False))
    assert 0 <= result["score"] <= 100
    assert result["level"] in ("low", "med", "high")


def test_model_handles_non_contiguous_classes():
    """Reproduces the real bug: training data with only "low"(0) and "high"(2)
    present, skipping "med"(1) entirely -- XGBClassifier's sklearn wrapper
    rejects this as non-contiguous even with num_class=3 forced; the
    Booster/DMatrix API must not."""
    config = TrustScoreConfig()
    rng = random.Random(5)
    features, labels = [], []
    for _ in range(20):
        features.append(_synthetic_features(rng, reliable=True))
        labels.append("high")
        features.append(_synthetic_features(rng, reliable=False))
        labels.append("low")
    model = train_model(features, labels, config)
    result = score_profile(model, _synthetic_features(rng, reliable=True))
    assert 0 <= result["score"] <= 100
    assert result["level"] in ("low", "med", "high")
