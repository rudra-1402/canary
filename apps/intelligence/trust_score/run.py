import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from generator.db import close_client, get_client
from quality.gates import judge_temporal_label_leakage
from trust_score.config import TrustScoreConfig
from trust_score.evaluate import evaluate_role
from trust_score.features import compute_features
from trust_score.fetch import load_dataset
from trust_score.labels import (
    LabelDegeneracyError,
    assert_label_distribution,
    bucket_label,
    build_temporal_examples,
    derive_bucket_thresholds,
)
from trust_score.model import score_profile, train_model
from trust_score.persistence import persist_trust_score


def prepare_output_collections(db, wipe: bool):
    """Protect persisted TrustScore snapshots from accidental duplication."""
    existing = db.trustscores.count_documents({})
    if existing and not wipe:
        sys.exit(
            f"Refusing to run: trustscores already holds {existing} documents and this "
            "pipeline is not idempotent -- a second run would duplicate every snapshot. "
            "Re-run with --wipe to clear trustscores and their risksignals first."
        )
    if wipe:
        db.trustscores.delete_many({})
        db.risksignals.delete_many({"parentType": "TrustScore"})


def prepare_feature_rows(dataset: dict, config, now: datetime) -> list[dict]:
    """Emit the role-aware superset feature rows without training or scoring."""
    rows = []
    for profile in dataset["profiles"]:
        profile_id = profile["_id"]
        role = profile["role"]
        rows.append(
            {
                "profile_id": profile_id,
                "features": compute_features(
                    dataset["outcomes_by_profile"].get(profile_id, []),
                    dataset["reviews_by_subject"].get(profile_id, []),
                    role,
                    now,
                    config,
                ),
            }
        )
    return rows


def train_temporal_models(dataset: dict, config) -> tuple[dict, dict]:
    """Train one role model after enforcing the real temporal label gates."""
    models, thresholds_by_role = {}, {}
    examples_by_role = {
        role: build_temporal_examples(dataset, config, role) for role in ("freelancer", "client")
    }
    failures = {}
    for role, examples in examples_by_role.items():
        try:
            assert_label_distribution([example["label_value"] for example in examples])
        except LabelDegeneracyError as error:
            failures[role] = str(error)
    if failures:
        raise LabelDegeneracyError("; ".join(f"{role}: {failure}" for role, failure in failures.items()))

    for role in ("freelancer", "client"):
        examples = examples_by_role[role]
        # Gate 4b is a release condition, not something bucket derivation may hide.
        thresholds = derive_bucket_thresholds([example["label_value"] for example in examples])
        labels = [bucket_label(example["label_value"], thresholds) for example in examples]
        models[role] = train_model([example["features"] for example in examples], labels, config)
        thresholds_by_role[role] = thresholds
    return models, thresholds_by_role


def score_current_profiles(dataset: dict, models: dict, config, now: datetime) -> list[dict]:
    """Score current feature windows with their role-specific temporal model."""
    snapshots = []
    profiles_by_id = {profile["_id"]: profile for profile in dataset["profiles"]}
    for row in prepare_feature_rows(dataset, config, now):
        profile = profiles_by_id[row["profile_id"]]
        features = row["features"]
        if features["observed_engagement_count"] < config.min_engagements_for_scoring:
            snapshots.append(
                {
                    "profile_id": row["profile_id"],
                    "status": "insufficient-history",
                    "generatedAt": now,
                    "riskSignals": [],
                }
            )
            continue
        prediction = score_profile(models[profile["role"]], features)
        score = prediction["score"]
        snapshots.append(
            {
                "profile_id": row["profile_id"],
                "status": "scored",
                "score": score,
                "level": "low" if score < 33.34 else "med" if score < 66.67 else "high",
                "generatedAt": now,
                "riskSignals": [],
            }
        )
    return snapshots


def _load_ground_truth(manifest_path: Path, id_map_path: Path) -> tuple[dict, dict]:
    manifest = json.loads(manifest_path.read_text())
    local_to_real = json.loads(id_map_path.read_text())
    manifest_by_local = {record["profileLocalId"]: record for record in manifest["profiles"]}
    real_to_local = {real_id: local_id for local_id, real_id in local_to_real.items()}
    return manifest_by_local, real_to_local


def main(argv=None):
    parser = argparse.ArgumentParser(description="Train and evaluate the temporal Canary Trust Score")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--prepare-features-only", action="store_true")
    parser.add_argument("--evaluate", action="store_true", help="Report held-out temporal-label metrics.")
    parser.add_argument(
        "--persist", action="store_true", help="Write current snapshots after successful training."
    )
    parser.add_argument(
        "--wipe", action="store_true", help="Replace existing TrustScore snapshots (requires --persist)."
    )
    parser.add_argument("--manifest", default="ground-truth-manifest.json")
    parser.add_argument("--id-map", default="profile-id-map.json")
    args = parser.parse_args(argv)
    if args.wipe and not args.persist:
        parser.error("--wipe requires --persist")

    config = TrustScoreConfig(seed=args.seed)
    client = get_client()
    try:
        db = client.get_default_database()
        dataset = load_dataset(db)
        if args.prepare_features_only:
            rows = prepare_feature_rows(dataset, config, datetime.utcnow())
            print(f"Prepared {len(rows)} role-aware Trust Score feature rows.")
            return rows

        gate = judge_temporal_label_leakage(dataset, config)
        print(f"Gate 1 leakage: {gate.status} ({len(gate.failures)} failing profiles)")
        if str(gate.status) != "PASS":
            raise RuntimeError("Temporal leakage gate failed; refusing to train or score.")

        if args.evaluate:
            manifest_by_local, real_to_local = _load_ground_truth(Path(args.manifest), Path(args.id_map))
            results = [
                evaluate_role(db, role, config, manifest_by_local, real_to_local)
                for role in ("freelancer", "client")
            ]
            for result in results:
                print(
                    f"{result['role']}: Spearman={result['spearman_correlation']:.4f}; "
                    f"bad-actor recall={result['bad_actor_recall']}; "
                    f"test={result['test_examples']}"
                )
            return results

        models, _ = train_temporal_models(dataset, config)
        snapshots = score_current_profiles(dataset, models, config, datetime.utcnow())
        if args.persist:
            prepare_output_collections(db, args.wipe)
            for snapshot in snapshots:
                persist_trust_score(db, snapshot.pop("profile_id"), snapshot)
        print(f"Trained temporal models and scored {len(snapshots)} Profiles.")
        return snapshots
    finally:
        close_client(client)


if __name__ == "__main__":
    main()
