import pandas as pd

from trust_score.features import FEATURE_NAMES

# Re-export the one shared list for existing consumers. This must remain an alias,
# not a copy: silent column-order drift would break saved model compatibility.
FEATURE_COLUMNS = FEATURE_NAMES


class ModelExecutionUnavailableError(RuntimeError):
    """Raised until A4 supplies measured label weights and bucket thresholds."""


def features_to_dataframe(feature_dicts: list[dict]) -> pd.DataFrame:
    rows = [{column: features[column] for column in FEATURE_COLUMNS} for features in feature_dicts]
    return pd.DataFrame(rows)


def is_cold_start(features: dict, config) -> bool:
    observed_count = features.get("observed_engagement_count", features.get("engagement_count", 0))
    return observed_count < config.min_engagements_for_scoring


def _model_execution_unavailable() -> None:
    raise ModelExecutionUnavailableError(
        "Trust Score training and scoring are unavailable until A4 defines measured label weights "
        "and bucket thresholds."
    )


def train_model(feature_dicts: list[dict], labels: list[str], config):
    _model_execution_unavailable()


def score_profile(model, features: dict) -> dict:
    _model_execution_unavailable()
