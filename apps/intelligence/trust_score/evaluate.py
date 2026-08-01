from datetime import datetime

from trust_score.features import compute_features
from trust_score.labels import compute_label_terms
from trust_score.model import ModelExecutionUnavailableError, is_cold_start


def prepare_role_feature_rows(dataset: dict, role: str, config, now=None) -> list[dict]:
    """Prepare role-aware evaluation inputs without manufacturing A4 labels."""
    now = now or datetime.utcnow()
    rows = []
    for profile in (profile for profile in dataset["profiles"] if profile["role"] == role):
        profile_id = profile["_id"]
        features = compute_features(
            dataset["outcomes_by_profile"].get(profile_id, []),
            dataset["reviews_by_subject"].get(profile_id, []),
            role,
            now,
            config,
        )
        if not is_cold_start(features, config):
            rows.append(
                {
                    "profile_id": profile_id,
                    "features": features,
                    "label_terms": compute_label_terms(features),
                }
            )
    return rows


def evaluate_role(db, role: str, config, manifest_by_local: dict, real_to_local: dict, now=None) -> dict:
    raise ModelExecutionUnavailableError(
        "Trust Score evaluation is unavailable until A4 defines measured label weights and bucket thresholds."
    )
