"""Persist and load the fixed Trust Score models used for per-profile rescoring."""

import pickle
from pathlib import Path

from trust_score.model import FEATURE_COLUMNS


def save_model_artifact(path, models: dict, thresholds_by_role: dict, config) -> None:
    """Save role models with the metadata that defines their scoring contract."""
    class_indices_by_role = {role: list(model.trust_score_class_indices_) for role, model in models.items()}
    artifact = {
        "models": models,
        "thresholds_by_role": thresholds_by_role,
        "feature_columns": list(FEATURE_COLUMNS),
        "seed": config.seed,
        "class_indices_by_role": class_indices_by_role,
    }
    unique_models = {id(model): model for model in models.values()}.values()
    for model in unique_models:
        del model.trust_score_class_indices_
    try:
        Path(path).write_bytes(pickle.dumps(artifact))
    finally:
        for role, model in models.items():
            model.trust_score_class_indices_ = class_indices_by_role[role]


def load_model_artifact(path, config) -> tuple[dict, dict]:
    """Load a saved model artifact, refusing incompatible feature/config contracts."""
    artifact = pickle.loads(Path(path).read_bytes())
    if artifact["feature_columns"] != list(FEATURE_COLUMNS):
        raise ValueError("Saved model artifact feature columns do not match the running code.")
    if artifact["seed"] != config.seed:
        raise ValueError("Saved model artifact seed does not match the running config.")
    for role, model in artifact["models"].items():
        model.trust_score_class_indices_ = artifact["class_indices_by_role"][role]
    return artifact["models"], artifact["thresholds_by_role"]
