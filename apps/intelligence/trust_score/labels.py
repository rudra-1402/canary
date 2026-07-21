LABEL_THRESHOLDS = {"high": 0.75, "med": 0.50}
LABEL_TO_INT = {"low": 0, "med": 1, "high": 2}
INT_TO_LABEL = {v: k for k, v in LABEL_TO_INT.items()}


def compute_reliability_index(features: dict) -> float:
    """Decision 3: the supervised training label comes from what a live app can
    actually observe (Outcome fields), never the hidden trueArchetype."""
    return (
        0.4 * features["paid_in_full_rate"]
        + 0.3 * features["on_time_rate"]
        + 0.2 * (1 - features["ghost_rate"])
        + 0.1 * (1 - features["scope_creep_rate"])
    )


def bucket_label(reliability_index: float) -> str:
    if reliability_index >= LABEL_THRESHOLDS["high"]:
        return "high"
    if reliability_index >= LABEL_THRESHOLDS["med"]:
        return "med"
    return "low"
