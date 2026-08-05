import numpy as np
import pandas as pd
from xgboost import XGBClassifier

from trust_score.features import FEATURE_NAMES
from trust_score.labels import LABEL_TO_INT

# Re-export the one shared list for existing consumers. This must remain an alias,
# not a copy: silent column-order drift would break saved model compatibility.
FEATURE_COLUMNS = FEATURE_NAMES


def features_to_dataframe(feature_dicts: list[dict]) -> pd.DataFrame:
    rows = [{column: features[column] for column in FEATURE_COLUMNS} for features in feature_dicts]
    return pd.DataFrame(rows)


def is_cold_start(features: dict, config) -> bool:
    observed_count = features.get("observed_engagement_count", features.get("engagement_count", 0))
    return observed_count < config.min_engagements_for_scoring


def train_model(feature_dicts: list[dict], labels: list[str], config):
    """Train the fixed-config ordinal Trust Score classifier on temporal labels."""
    if not feature_dicts:
        raise ValueError("Cannot train a Trust Score model without temporal examples.")
    if len(feature_dicts) != len(labels):
        raise ValueError("Feature and label counts must match.")
    encoded_labels = [LABEL_TO_INT[label] for label in labels]
    original_classes = sorted(set(encoded_labels))
    if len(original_classes) < 2:
        raise ValueError("Temporal training labels must contain at least two bands.")
    compact_labels = [original_classes.index(label) for label in encoded_labels]
    model = XGBClassifier(
        objective="multi:softprob",
        num_class=len(original_classes),
        n_estimators=config.xgb_n_estimators,
        max_depth=config.xgb_max_depth,
        learning_rate=config.xgb_learning_rate,
        random_state=config.seed,
        n_jobs=1,
        eval_metric="mlogloss",
    )
    model.fit(features_to_dataframe(feature_dicts), compact_labels)
    # XGBoost requires consecutive class IDs; retain the ordinal band IDs for scoring.
    model.trust_score_class_indices_ = np.asarray(original_classes, dtype=float)
    return model


def score_profile(model, features: dict) -> dict:
    """Return a continuous 0–100 standing from the class-probability expectation."""
    probabilities = model.predict_proba(features_to_dataframe([features]))[0]
    class_indices = getattr(model, "trust_score_class_indices_", model.classes_.astype(float))
    expected_band = float(np.dot(probabilities, class_indices) / max(LABEL_TO_INT.values()))
    return {
        "score": round(expected_band * 100, 2),
        "probabilities": {
            str(int(label)): float(probability)
            for label, probability in zip(class_indices, probabilities, strict=True)
        },
    }
