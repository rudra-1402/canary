from scipy.stats import spearmanr
from sklearn.model_selection import train_test_split

from trust_score.fetch import load_dataset
from trust_score.labels import (
    bucket_label,
    build_temporal_examples,
    derive_bucket_thresholds,
)
from trust_score.model import score_profile, train_model


def prepare_role_feature_rows(dataset: dict, role: str, config, now=None) -> list[dict]:
    """Prepare only feature/label pairs built from disjoint temporal windows.

    ``now`` remains accepted for the public API; temporal examples instead use each
    Profile's observed split point as their feature cutoff.
    """
    del now
    return build_temporal_examples(dataset, config, role)


def _bad_actor(example: dict, manifest_by_local: dict, real_to_local: dict) -> bool | None:
    local_id = real_to_local.get(str(example["profile_id"]))
    if local_id is None:
        return None
    record = manifest_by_local.get(local_id)
    if record is None:
        return None
    return bool(record.get("isBadActor", record.get("trueArchetype") == "bad-actor"))


def evaluate_role(db, role: str, config, manifest_by_local: dict, real_to_local: dict, now=None) -> dict:
    """Evaluate a role on a held-out Profile split and untouched future outcomes."""
    del now
    examples = prepare_role_feature_rows(load_dataset(db), role, config)
    if len(examples) < 2:
        raise ValueError(f"{role} has too few temporal examples for held-out evaluation.")

    indices = list(range(len(examples)))
    train_indices, test_indices = train_test_split(
        indices, test_size=config.eval_test_size, random_state=config.seed
    )
    train_examples = [examples[index] for index in train_indices]
    test_examples = [examples[index] for index in test_indices]
    thresholds = derive_bucket_thresholds([example["label_value"] for example in train_examples])
    train_labels = [bucket_label(example["label_value"], thresholds) for example in train_examples]
    model = train_model([example["features"] for example in train_examples], train_labels, config)

    predicted_scores = [score_profile(model, example["features"])["score"] for example in test_examples]
    actual_labels = [example["label_value"] for example in test_examples]
    correlation = float(spearmanr(predicted_scores, actual_labels).statistic)

    joined_truth = [
        (example, score, _bad_actor(example, manifest_by_local, real_to_local))
        for example, score in zip(test_examples, predicted_scores, strict=True)
    ]
    known_truth = [row for row in joined_truth if row[2] is not None]
    bad_actor_rows = [row for row in known_truth if row[2]]
    bad_actor_recall = (
        sum(score < 50 for _, score, _ in bad_actor_rows) / len(bad_actor_rows) if bad_actor_rows else None
    )
    return {
        "role": role,
        "examples": len(examples),
        "train_examples": len(train_examples),
        "test_examples": len(test_examples),
        "thresholds": thresholds,
        "spearman_correlation": correlation,
        "bad_actor_recall": bad_actor_recall,
        "bad_actor_test_profiles": len(bad_actor_rows),
    }
