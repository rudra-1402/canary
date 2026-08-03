"""CLI: score the seeded marketplace for review-collusion risk and grade the
result against planted ground truth. Read-only -- writes nothing to Mongo.

    python -m collusion.run
"""

import argparse
from pathlib import Path

from collusion.detector import run_detector
from collusion.evaluate import (
    evaluate_detector,
    load_detectable_ring_engagement_profile_ids,
    load_ground_truth,
    random_baseline,
)
from collusion.fetch import load_pair_dataset
from generator.db import close_client, get_client


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Score profiles for review-collusion risk and grade against planted ground truth."
    )
    parser.add_argument("--manifest", default="ground-truth-manifest.json")
    parser.add_argument("--id-map", default="profile-id-map.json")
    parser.add_argument("--baseline-seed", type=int, default=42)
    args = parser.parse_args(argv)

    client = get_client()
    try:
        db = client.get_default_database()
        dataset = load_pair_dataset(db)
        detection = run_detector(dataset)
        scored, rings = detection["scored"], detection["rings"]

        ground_truth = load_ground_truth(Path(args.manifest), Path(args.id_map))
        detectable_ids = load_detectable_ring_engagement_profile_ids(db)

        result = evaluate_detector(scored, ground_truth["colluder_profile_ids"], detectable_ids)
        baseline = random_baseline(
            scored, ground_truth["colluder_profile_ids"], result.flagged_n, seed=args.baseline_seed
        )

        print(f"Profiles with any review pair: {len(scored)}")
        print(f"Candidate rings (connected suspect components, size>=2): {len(rings)}")
        print(
            f"Detector: planted={result.planted_n} flagged={result.flagged_n} "
            f"caught={result.caught_n} false_positives={result.false_positive_n} "
            f"precision={result.precision} recall={result.recall:.4f}"
        )
        print(
            f"Detectable ceiling (planted colluders with >=1 ring-internal engagement "
            f"in this seed): {result.detectable_ceiling_n}; "
            f"recall within that ceiling={result.detectable_recall}"
        )
        print(
            f"Random baseline (same flagged_n={baseline.flagged_n}): "
            f"caught={baseline.caught_n} precision={baseline.precision} recall={baseline.recall:.4f}"
        )
        return {"scored": scored, "rings": rings, "result": result, "baseline": baseline}
    finally:
        close_client(client)


if __name__ == "__main__":
    main()
