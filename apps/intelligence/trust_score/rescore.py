"""Per-Profile Trust Score rescoring entrypoint."""

import argparse
import sys
from datetime import datetime

from bson import ObjectId

from generator.db import close_client, get_client
from trust_score.artifact import load_model_artifact
from trust_score.config import TrustScoreConfig
from trust_score.features import compute_features
from trust_score.fetch import load_profile_dataset
from trust_score.model import is_cold_start, score_profile
from trust_score.persistence import persist_trust_score
from trust_score.signals import build_risk_signals


def rescore_profiles(db, profile_ids: list, models: dict, config, now: datetime) -> list[dict]:
    """Write one fresh snapshot for each requested Profile."""
    results = []
    for profile_id in profile_ids:
        dataset = load_profile_dataset(db, profile_id)
        profile = dataset["profile"]
        features = compute_features(dataset["outcomes"], dataset["reviews"], profile["role"], now, config)
        snapshot = {"generatedAt": now, "riskSignals": []}
        if is_cold_start(features, config):
            snapshot["status"] = "insufficient-history"
        else:
            prediction = score_profile(models[profile["role"]], features)
            score = prediction["score"]
            snapshot.update(
                status="scored",
                score=score,
                level="low" if score < 33.34 else "med" if score < 66.67 else "high",
                riskSignals=build_risk_signals(features, profile["role"]),
            )
        trust_score_id = persist_trust_score(db, profile_id, snapshot)
        results.append({"profile_id": profile_id, "trust_score_id": trust_score_id, **snapshot})
    return results


def main(argv=None):
    parser = argparse.ArgumentParser(description="Rescore one or more Canary Profiles")
    parser.add_argument("profile_ids", nargs="+")
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)
    config = TrustScoreConfig(seed=args.seed)
    client = get_client()
    try:
        models, _ = load_model_artifact(args.artifact, config)
        return rescore_profiles(
            client.get_default_database(),
            [ObjectId(profile_id) for profile_id in args.profile_ids],
            models,
            config,
            datetime.utcnow(),
        )
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error
    finally:
        close_client(client)


if __name__ == "__main__":
    main()
