from math import isnan

import pytest

from trust_score.artifact import load_model_artifact, save_model_artifact
from trust_score.features import FEATURE_NAMES
from trust_score.model import (
    FEATURE_COLUMNS,
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


def test_training_and_scoring_use_the_a4_label_contract():
    config = type(
        "Config",
        (),
        {"xgb_n_estimators": 2, "xgb_max_depth": 2, "xgb_learning_rate": 0.1, "seed": 42},
    )()
    model = train_model([_freelancer_features(), _client_features()], ["low", "high"], config)
    prediction = score_profile(model, _freelancer_features())

    assert 0 <= prediction["score"] <= 100
    assert prediction["probabilities"]


def test_is_cold_start_uses_observed_engagement_count():
    config = type("Config", (), {"min_engagements_for_scoring": 3})()
    assert is_cold_start({"observed_engagement_count": 2}, config) is True
    assert is_cold_start({"observed_engagement_count": 3}, config) is False


def test_model_artifact_round_trip_preserves_scores_exactly_for_both_roles(tmp_path):
    config = type(
        "Config",
        (),
        {"xgb_n_estimators": 2, "xgb_max_depth": 2, "xgb_learning_rate": 0.1, "seed": 42},
    )()
    models = {
        "freelancer": train_model([_freelancer_features(), _freelancer_features()], ["low", "high"], config),
        "client": train_model([_client_features(), _client_features()], ["low", "high"], config),
    }
    path = tmp_path / "trust-score-model.pkl"
    before = {
        "freelancer": score_profile(models["freelancer"], _freelancer_features()),
        "client": score_profile(models["client"], _client_features()),
    }

    save_model_artifact(path, models, {"freelancer": (1, 2), "client": (3, 4)}, config)
    loaded_models, _ = load_model_artifact(path, config)

    assert score_profile(loaded_models["freelancer"], _freelancer_features()) == before["freelancer"]
    assert score_profile(loaded_models["client"], _client_features()) == before["client"]


def test_model_artifact_load_refuses_feature_column_mismatch(tmp_path):
    config = type(
        "Config",
        (),
        {"xgb_n_estimators": 2, "xgb_max_depth": 2, "xgb_learning_rate": 0.1, "seed": 42},
    )()
    path = tmp_path / "trust-score-model.pkl"
    model = train_model([_freelancer_features(), _freelancer_features()], ["low", "high"], config)
    save_model_artifact(path, {"freelancer": model, "client": model}, {}, config)
    import pickle

    artifact = pickle.loads(path.read_bytes())
    artifact["feature_columns"] = ["drifted"]
    path.write_bytes(pickle.dumps(artifact))

    with pytest.raises(ValueError, match="feature columns"):
        load_model_artifact(path, config)
