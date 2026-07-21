import numpy as np
import pandas as pd
import xgboost as xgb

from trust_score.labels import INT_TO_LABEL, LABEL_TO_INT

FEATURE_COLUMNS = [
    "paid_in_full_rate",
    "on_time_rate",
    "avg_days_late",
    "ghost_rate",
    "scope_creep_rate",
    "completion_rate",
    "avg_review_rating",
    "recency_weighted_on_time_rate",
    "trend_slope",
]


def features_to_dataframe(feature_dicts: list[dict]) -> pd.DataFrame:
    return pd.DataFrame([{col: f[col] for col in FEATURE_COLUMNS} for f in feature_dicts])


def is_cold_start(features: dict, config) -> bool:
    return features["engagement_count"] < config.min_engagements_for_scoring


def train_model(feature_dicts: list[dict], labels: list[str], config) -> xgb.Booster:
    """Decision 4: XGBoost, chosen over Random Forest/LightGBM/CatBoost/AutoML
    (see design spec). labels are the Outcome-derived bucket from labels.py --
    never trueArchetype (Decision 3's hard rule).

    Uses the low-level Booster/DMatrix API instead of the sklearn XGBClassifier
    wrapper deliberately: XGBClassifier.fit() validates that np.unique(y) is a
    dense contiguous range and raises if a training fold happens to be missing
    a class (e.g. only "low"/"high" present, no "med" -- labels {0, 2}), even
    when num_class is passed explicitly. A role's real data can legitimately
    have zero profiles in one bucket at any point in time, so this must not
    crash. The low-level API has no such validation -- it only needs num_class
    in the params dict and integer labels in [0, num_class), gaps and all."""
    X = features_to_dataframe(feature_dicts)
    y = np.array([LABEL_TO_INT[label] for label in labels])
    dtrain = xgb.DMatrix(X, label=y)
    params = {
        "objective": "multi:softprob",
        "num_class": 3,
        "max_depth": config.xgb_max_depth,
        "eta": config.xgb_learning_rate,
        "seed": config.seed,
        "eval_metric": "mlogloss",
    }
    return xgb.train(params, dtrain, num_boost_round=config.xgb_n_estimators)


def score_profile(model: xgb.Booster, features: dict) -> dict:
    """0-100 score = probability-weighted continuous read (0 for 'low', 50 for
    'med', 100 for 'high'), more informative than the bare argmax class
    boundary. level = the model's most likely class."""
    X = features_to_dataframe([features])
    dtest = xgb.DMatrix(X)
    proba = model.predict(dtest)[0]
    score = round(100 * (0.5 * proba[LABEL_TO_INT["med"]] + 1.0 * proba[LABEL_TO_INT["high"]]))
    score = max(0, min(100, int(score)))
    level = INT_TO_LABEL[int(proba.argmax())]
    return {"score": score, "level": level}
