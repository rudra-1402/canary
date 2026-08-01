LABEL_TO_INT = {"low": 0, "med": 1, "high": 2}
INT_TO_LABEL = {value: label for label, value in LABEL_TO_INT.items()}

# These are label components, not weights or buckets. A4 owns the measurement
# that turns them into an aggregate training label.
ROLE_LABEL_TERMS = {
    "freelancer": ("ghost", "on_time_delivery"),
    "client": ("ghost", "paid_in_full", "revision_restraint"),
}


class LabelingUnavailableError(RuntimeError):
    """Raised until A4 defines measured weights and bucket thresholds."""


def _role_from_features(features: dict) -> str:
    role = features.get("subject_role")
    if role == 0:
        return "freelancer"
    if role == 1:
        return "client"
    raise ValueError("Label components require numeric subject_role: 0 (freelancer) or 1 (client).")


def compute_label_terms(features: dict) -> dict:
    """Return unweighted, per-role label components from the subject's own conduct."""
    role = _role_from_features(features)
    if role == "freelancer":
        return {
            "ghost": 1 - features["ghost_rate"],
            "on_time_delivery": features["on_time_rate"],
        }
    return {
        "ghost": 1 - features["ghost_rate"],
        "paid_in_full": features["paid_in_full_rate"],
        "revision_restraint": 1 - features["scope_creep_rate"],
    }


def compute_reliability_index(features: dict) -> float:
    raise LabelingUnavailableError(
        "Reliability labels are unavailable until A4 defines measured per-role weights and bucket thresholds."
    )


def bucket_label(reliability_index: float) -> str:
    raise LabelingUnavailableError(
        "Reliability label buckets are unavailable until A4 defines measured thresholds."
    )
