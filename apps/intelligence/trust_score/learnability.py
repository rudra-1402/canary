"""Gate A.3: distribution floors (Gate 4b) prove a label can be banded; they say
nothing about whether it can be predicted. This gate proves the trained model beats
label-permuted controls on data it has never seen, before persistence is allowed.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.stats import spearmanr
from sklearn.model_selection import train_test_split

from trust_score.labels import bucket_label, derive_bucket_thresholds
from trust_score.model import score_profile, train_model

CONTROL_MODEL_COUNT = 5
# Not tuned to pass: a permuted-label control is ~0 by construction, so a real,
# learnable label clears this by roughly 3-4x (see PLAN-UI.md Part A.3).
LEARNABILITY_MARGIN = 0.10


class LearnabilityError(ValueError):
    """Raised instead of persisting a model that cannot beat permuted-label controls."""


@dataclass(frozen=True)
class LearnabilityResult:
    role: str
    real_spearman: float
    permuted_spearman: list[float]


def passes_learnability_condition(real_spearman: float, permuted_spearmans: Sequence[float]) -> bool:
    """The A.3 acceptance condition, isolated so it can be tested without training."""
    return real_spearman > 0 and real_spearman >= max(permuted_spearmans) + LEARNABILITY_MARGIN


def assert_role_learnability(role: str, examples: Sequence[dict[str, Any]], config) -> LearnabilityResult:
    """Refuse to persist a role's model unless it beats permuted-label controls.

    Splits ``examples`` with the same fixed seed and test size evaluate.py reports
    Spearman with, trains the real model on the training split, trains
    ``CONTROL_MODEL_COUNT`` controls on the same split with training labels randomly
    permuted, and evaluates every model on the same untouched held-out split.
    """
    if len(examples) < 2:
        raise LearnabilityError(f"{role} has too few temporal examples for a learnability check.")

    indices = list(range(len(examples)))
    train_indices, test_indices = train_test_split(
        indices, test_size=config.eval_test_size, random_state=config.seed
    )
    train_examples = [examples[index] for index in train_indices]
    test_examples = [examples[index] for index in test_indices]
    if len(train_examples) < 2 or not test_examples:
        raise LearnabilityError(f"{role} has too few examples in one split for a learnability check.")

    thresholds = derive_bucket_thresholds([example["label_value"] for example in train_examples])
    train_labels = [bucket_label(example["label_value"], thresholds) for example in train_examples]
    train_features = [example["features"] for example in train_examples]
    test_features = [example["features"] for example in test_examples]
    test_targets = [example["label_value"] for example in test_examples]

    real_model = train_model(train_features, train_labels, config)
    real_scores = [score_profile(real_model, features)["score"] for features in test_features]
    real_spearman = float(spearmanr(real_scores, test_targets).statistic)

    rng = np.random.default_rng(config.seed)
    permuted_spearmans = []
    for _ in range(CONTROL_MODEL_COUNT):
        permutation = rng.permutation(len(train_labels))
        shuffled_labels = [train_labels[index] for index in permutation]
        control_model = train_model(train_features, shuffled_labels, config)
        control_scores = [score_profile(control_model, features)["score"] for features in test_features]
        permuted_spearmans.append(float(spearmanr(control_scores, test_targets).statistic))

    # Printed unconditionally -- pass or fail -- so a run proves the comparison
    # actually executed, matching the existing "Gate 4b <role>: PASS ..." style.
    print(
        f"Gate A.3 {role}: real={real_spearman:.4f} "
        f"permuted_max={max(permuted_spearmans):.4f} "
        f"permuted={[round(value, 4) for value in permuted_spearmans]}"
    )

    if not passes_learnability_condition(real_spearman, permuted_spearmans):
        raise LearnabilityError(
            f"{role} fails the learnability gate: real Spearman={real_spearman:.4f}, "
            f"permuted max={max(permuted_spearmans):.4f} (requires real > 0 and "
            f"real >= permuted_max + {LEARNABILITY_MARGIN} on the held-out split)."
        )
    return LearnabilityResult(role=role, real_spearman=real_spearman, permuted_spearman=permuted_spearmans)
