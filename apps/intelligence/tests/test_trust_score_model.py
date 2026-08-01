from math import isnan

import pytest

from trust_score.features import FEATURE_NAMES
from trust_score.model import (
    FEATURE_COLUMNS,
    ModelExecutionUnavailableError,
    features_to_dataframe,
    is_cold_start,
    score_profile,
    train_model,
)


def _freelancer_features():
    return {
        "subject_role": 0,
        "ghost_rate": 0.1,
        "completion_rate": 0.9,
        "avg_review_rating": 4.5,
        "observed_engagement_count": 10,
        "on_time_rate": 0.9,
        "avg_days_late": 0.0,
        "recency_weighted_on_time_rate": 0.95,
        "paid_in_full_rate": float("nan"),
        "scope_creep_rate": float("nan"),
        "trend_slope": 0.2,
    }


def _client_features():
    return {
        "subject_role": 1,
        "ghost_rate": 0.2,
        "completion_rate": 0.8,
        "avg_review_rating": 3.5,
        "observed_engagement_count": 8,
        "on_time_rate": float("nan"),
        "avg_days_late": float("nan"),
        "recency_weighted_on_time_rate": float("nan"),
        "paid_in_full_rate": 0.75,
        "scope_creep_rate": 0.25,
        "trend_slope": 0.1,
    }


def test_feature_columns_and_feature_names_are_one_source_of_truth():
    assert FEATURE_COLUMNS is FEATURE_NAMES


def test_features_to_dataframe_accepts_both_roles_in_one_numeric_superset_order():
    df = features_to_dataframe([_freelancer_features(), _client_features()])

    assert list(df.columns) == FEATURE_COLUMNS
    assert all(dtype.kind in "fi" for dtype in df.dtypes)
    assert df.loc[0, "subject_role"] == 0
    assert df.loc[1, "subject_role"] == 1
    assert isnan(df.loc[0, "paid_in_full_rate"])
    assert isnan(df.loc[1, "on_time_rate"])


def test_training_and_scoring_fail_loudly_until_a4_defines_labels():
    with pytest.raises(ModelExecutionUnavailableError, match="A4"):
        train_model([_freelancer_features()], ["high"], object())
    with pytest.raises(ModelExecutionUnavailableError, match="A4"):
        score_profile(object(), _freelancer_features())


def test_is_cold_start_uses_observed_engagement_count():
    config = type("Config", (), {"min_engagements_for_scoring": 3})()
    assert is_cold_start({"observed_engagement_count": 2}, config) is True
    assert is_cold_start({"observed_engagement_count": 3}, config) is False
