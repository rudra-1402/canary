from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from math import isnan
from typing import Any

import numpy as np

from trust_score.features import compute_features

LABEL_TO_INT = {"low": 0, "med": 1, "high": 2}
INT_TO_LABEL = {value: label for label, value in LABEL_TO_INT.items()}

ROLE_LABEL_TERMS = {
    "freelancer": ("ghost", "on_time_delivery"),
    "client": ("ghost", "paid_in_full", "revision_restraint"),
}

MIN_FEATURE_OUTCOMES = 3
MIN_LABEL_OUTCOMES = 1
MIN_DISTINCT_LABEL_VALUES = 20
MAX_LABEL_VALUE_SHARE = 0.10


@dataclass(frozen=True)
class LabelThresholds:
    """Distribution-derived boundaries for the ordered training bands."""

    low_to_med: float
    med_to_high: float


class LabelDegeneracyError(ValueError):
    """Raised rather than manufacturing a scoreable-looking degenerate label."""


def _role_from_features(features: dict) -> str:
    role = features.get("subject_role")
    if role == 0:
        return "freelancer"
    if role == 1:
        return "client"
    raise ValueError("Label components require numeric subject_role: 0 (freelancer) or 1 (client).")


def compute_label_terms(features: dict) -> dict:
    """Return the fixed, unweighted conduct components for one temporal window."""
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
    """Average the predetermined terms; weights are intentionally not fitted.

    Equal weighting keeps the target definition independent of the model/evaluation
    metric.  Each term already passed its independent-signal measurement; tuning
    them here would optimise the number we later report.
    """
    terms = compute_label_terms(features)
    return sum(terms.values()) / len(terms)


def derive_bucket_thresholds(label_values: Sequence[float]) -> LabelThresholds:
    """Use tertiles from the observed temporal-label distribution, never constants."""
    values = sorted(float(value) for value in label_values if not isnan(float(value)))
    if not values:
        raise ValueError("Cannot derive label buckets without label values.")
    low_to_med, med_to_high = np.quantile(values, [1 / 3, 2 / 3], method="linear")
    if low_to_med >= med_to_high:
        raise LabelDegeneracyError("Temporal label distribution cannot form three non-degenerate bands.")
    return LabelThresholds(float(low_to_med), float(med_to_high))


def bucket_label(reliability_index: float, thresholds: LabelThresholds) -> str:
    if reliability_index < thresholds.low_to_med:
        return "low"
    if reliability_index < thresholds.med_to_high:
        return "med"
    return "high"


def assert_label_distribution(label_values: Sequence[float]) -> dict[str, float]:
    """Enforce Gate 4b against raw (pre-bucket) temporal label values."""
    values = [float(value) for value in label_values if not isnan(float(value))]
    if not values:
        raise LabelDegeneracyError("Temporal label distribution has no usable values.")
    counts = Counter(values)
    distinct = len(counts)
    largest_share = max(counts.values()) / len(values)
    if distinct < MIN_DISTINCT_LABEL_VALUES or largest_share > MAX_LABEL_VALUE_SHARE:
        raise LabelDegeneracyError(
            "Temporal label fails Gate 4b: "
            f"distinct={distinct} (requires >= {MIN_DISTINCT_LABEL_VALUES}), "
            f"largest_share={largest_share:.4f} (requires <= {MAX_LABEL_VALUE_SHARE:.2f})."
        )
    return {"distinct": distinct, "largest_share": largest_share}


def _outcome_row(outcome: dict, fallback_id: str) -> dict:
    return {
        "row_id": str(outcome.get("_id", fallback_id)),
        "recordedAt": outcome["recordedAt"],
    }


def build_temporal_example(
    profile_id: Any,
    role: str,
    outcomes: Sequence[dict],
    reviews: Sequence[dict],
    config,
) -> dict | None:
    """Build one leak-free feature/label pair from a Profile's observed history.

    T is the earliest timestamp that has at least three observed outcomes at or
    before it.  Every subsequent label outcome must be strictly after T; profiles
    with a tied final boundary therefore remain excluded rather than violating the
    temporal contract.
    """
    observed = sorted(
        (outcome for outcome in outcomes if outcome.get("observed", True)),
        key=lambda outcome: outcome["recordedAt"],
    )
    if len(observed) < MIN_FEATURE_OUTCOMES + MIN_LABEL_OUTCOMES:
        return None

    split_at = observed[MIN_FEATURE_OUTCOMES - 1]["recordedAt"]
    feature_outcomes = [outcome for outcome in observed if outcome["recordedAt"] <= split_at]
    label_outcomes = [outcome for outcome in observed if outcome["recordedAt"] > split_at]
    if len(feature_outcomes) < MIN_FEATURE_OUTCOMES or len(label_outcomes) < MIN_LABEL_OUTCOMES:
        return None

    feature_reviews = [review for review in reviews if review["visibleAt"] <= split_at]
    features = compute_features(feature_outcomes, feature_reviews, role, split_at, config)
    label_features = compute_features(label_outcomes, [], role, label_outcomes[-1]["recordedAt"], config)
    label_terms = compute_label_terms(label_features)
    return {
        "profile_id": profile_id,
        "role": role,
        "split_at": split_at,
        "features": features,
        "label_terms": label_terms,
        "label_value": sum(label_terms.values()) / len(label_terms),
        "feature_rows": [
            _outcome_row(outcome, f"{profile_id}:feature:{index}")
            for index, outcome in enumerate(feature_outcomes)
        ],
        "label_rows": [
            _outcome_row(outcome, f"{profile_id}:label:{index}")
            for index, outcome in enumerate(label_outcomes)
        ],
    }


def build_temporal_examples(dataset: dict, config, role: str | None = None) -> list[dict]:
    """Return every Profile that satisfies the fixed 3-before / 1-after rule."""
    examples = []
    for profile in dataset["profiles"]:
        if role is not None and profile["role"] != role:
            continue
        profile_id = profile["_id"]
        example = build_temporal_example(
            profile_id,
            profile["role"],
            dataset["outcomes_by_profile"].get(profile_id, []),
            dataset["reviews_by_subject"].get(profile_id, []),
            config,
        )
        if example is not None:
            examples.append(example)
    return examples


def leakage_windows(examples: Sequence[dict]) -> dict[str, dict]:
    """Adapt real temporal examples to the Gate 1 row-identity contract."""
    return {
        str(example["profile_id"]): {
            "feature_rows": example["feature_rows"],
            "label_rows": example["label_rows"],
        }
        for example in examples
    }
