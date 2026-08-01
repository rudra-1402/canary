import argparse
import sys
from datetime import datetime

from generator.db import close_client, get_client
from trust_score.config import TrustScoreConfig
from trust_score.features import compute_features
from trust_score.fetch import load_dataset
from trust_score.model import ModelExecutionUnavailableError


def prepare_output_collections(db, wipe: bool):
    """Legacy persistence guard retained for the A4 scoring pipeline."""
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


def require_feature_preparation_only(feature_preparation_only: bool) -> None:
    if not feature_preparation_only:
        raise ModelExecutionUnavailableError(
            "Trust Score training and scoring are unavailable until A4 defines measured label weights "
            "and bucket thresholds. "
            "Run with --prepare-features-only."
        )


def prepare_feature_rows(dataset: dict, config, now: datetime) -> list[dict]:
    """Emit the role-aware superset feature rows without training or scoring."""
    rows = []
    for profile in dataset["profiles"]:
        profile_id = profile["_id"]
        role = profile["role"]
        outcomes = dataset["outcomes_by_profile"].get(profile_id, [])
        reviews = dataset["reviews_by_subject"].get(profile_id, [])
        rows.append(
            {
                "profile_id": profile_id,
                "features": compute_features(outcomes, reviews, role, now, config),
            }
        )
    return rows


def main(argv=None):
    parser = argparse.ArgumentParser(description="Prepare Canary Trust Score feature rows")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--prepare-features-only",
        action="store_true",
        help="Emit role-aware feature rows only; A4 owns training and scoring.",
    )
    args = parser.parse_args(argv)
    require_feature_preparation_only(args.prepare_features_only)

    config = TrustScoreConfig(seed=args.seed)
    client = get_client()
    try:
        dataset = load_dataset(client.get_default_database())
        rows = prepare_feature_rows(dataset, config, datetime.utcnow())
    finally:
        close_client(client)

    print(
        f"Prepared {len(rows)} role-aware Trust Score feature rows; "
        "training and scoring remain disabled until A4."
    )
    return rows


if __name__ == "__main__":
    main()
