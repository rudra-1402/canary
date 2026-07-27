import argparse
from datetime import datetime

from generator.db import close_client, get_client
from trust_score.backfill import backfill_profile
from trust_score.config import TrustScoreConfig
from trust_score.explain import build_explainer
from trust_score.features import compute_features
from trust_score.fetch import load_dataset
from trust_score.labels import bucket_label, compute_reliability_index
from trust_score.model import is_cold_start, train_model
from trust_score.persistence import persist_trust_score

ROLES = ["freelancer", "client"]


def _train_and_score_role(db, role: str, config: TrustScoreConfig, now: datetime, dataset: dict) -> dict:
    role_profiles = [p for p in dataset["profiles"] if p["role"] == role]

    feature_rows, labels = [], []
    for profile in role_profiles:
        outcomes = dataset["outcomes_by_profile"].get(profile["_id"], [])
        reviews = dataset["reviews_by_subject"].get(profile["_id"], [])
        features = compute_features(outcomes, reviews, now, config)
        if not is_cold_start(features, config):
            feature_rows.append(features)
            labels.append(bucket_label(compute_reliability_index(features)))

    if not feature_rows:
        print(f"  {role}: no profiles above the cold-start threshold -- skipping training")
        return {"role": role, "trained_on": 0, "profiles_scored": 0, "snapshots_written": 0}

    model = train_model(feature_rows, labels, config)
    explainer = build_explainer(model)

    snapshots_written = 0
    for profile in role_profiles:
        outcomes = dataset["outcomes_by_profile"].get(profile["_id"], [])
        reviews = dataset["reviews_by_subject"].get(profile["_id"], [])
        snapshots = backfill_profile(outcomes, reviews, model, explainer, config, config.timeline_months, now)
        for snapshot in snapshots:
            persist_trust_score(db, profile["_id"], snapshot)
            snapshots_written += 1

    return {
        "role": role,
        "trained_on": len(feature_rows),
        "profiles_scored": len(role_profiles),
        "snapshots_written": snapshots_written,
    }


def main():
    parser = argparse.ArgumentParser(description="Compute and backfill Canary Trust Scores")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    config = TrustScoreConfig(seed=args.seed)
    client = get_client()
    db = client.get_default_database()
    now = datetime.utcnow()

    print("Loading dataset...")
    dataset = load_dataset(db)

    summary = []
    for role in ROLES:
        print(f"Training and scoring role: {role}")
        summary.append(_train_and_score_role(db, role, config, now, dataset))

    close_client(client)

    for entry in summary:
        print(
            f"  {entry['role']}: trained on {entry['trained_on']} profiles, "
            f"scored {entry['profiles_scored']} profiles, "
            f"wrote {entry['snapshots_written']} TrustScore snapshots"
        )


if __name__ == "__main__":
    main()
