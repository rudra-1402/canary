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


def train_model(feature_dicts: list[dict], labels: list[str], config) -> xgb.XGBClassifier:
    """Decision 4: XGBoost, chosen over Random Forest/LightGBM/CatBoost/AutoML
    (see design spec). labels are the Outcome-derived bucket from labels.py --
    never trueArchetype (Decision 3's hard rule)."""
    X = features_to_dataframe(feature_dicts)
    y = [LABEL_TO_INT[label] for label in labels]
    model = xgb.XGBClassifier(
        n_estimators=config.xgb_n_estimators,
        max_depth=config.xgb_max_depth,
        learning_rate=config.xgb_learning_rate,
        random_state=config.seed,
        eval_metric="mlogloss",
    )
    model.fit(X, y)
    return model


def score_profile(model: xgb.XGBClassifier, features: dict) -> dict:
    """0-100 score = probability-weighted continuous read (0 for 'low', 50 for
    'med', 100 for 'high'), more informative than the bare argmax class
    boundary. level = the model's most likely class."""
    X = features_to_dataframe([features])
    proba = model.predict_proba(X)[0]
    score = round(100 * (0.5 * proba[LABEL_TO_INT["med"]] + 1.0 * proba[LABEL_TO_INT["high"]]))
    score = max(0, min(100, int(score)))
    level = INT_TO_LABEL[int(proba.argmax())]
    return {"score": score, "level": level}
