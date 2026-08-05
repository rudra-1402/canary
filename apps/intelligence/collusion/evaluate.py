"""Ground-truth grading for the collusion detector -- a SEPARATE step from scoring.

Nothing in this module feeds back into collusion/detector.py, collusion/signals.py
or collusion/graph.py. It runs only after ``score_profiles``/``run_detector`` have
already produced a ranked, ground-truth-blind result; it then loads the planted
labels (from the manifest/id-map files, or -- for the detectable-ceiling diagnostic
only -- the ``isPlantedCollusion`` review flag) purely to grade that result.
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path

from bson import ObjectId


def load_ground_truth(manifest_path: Path, id_map_path: Path) -> dict:
    """The planted colluder roster: every profile that is a member of a planted
    collusion ring, regardless of whether that ring ever transacted internally.
    """
    manifest = json.loads(Path(manifest_path).read_text())
    local_to_real = json.loads(Path(id_map_path).read_text())

    colluder_profile_ids = {
        ObjectId(local_to_real[record["profileLocalId"]])
        for record in manifest["profiles"]
        if record["isColluder"] and record["profileLocalId"] in local_to_real
    }
    return {"colluder_profile_ids": colluder_profile_ids, "num_rings": len(manifest["rings"])}


def load_detectable_ring_engagement_profile_ids(db) -> set:
    """Ground-truth-only diagnostic: which profiles actually authored or received a
    review flagged ``isPlantedCollusion`` -- i.e. whose ring membership produced at
    least one real, reviewable transaction with a ring-mate. A planted colluder
    outside this set has left no collusive fingerprint anywhere in the observable
    data, so no detector -- this one or any other -- could recover it from review
    structure alone. This is read strictly for grading, after scoring; it is never
    passed into fetch/graph/signals/detector.
    """
    profile_ids = set()
    for review in db.reviews.find(
        {"isPlantedCollusion": True}, {"authorProfileId": 1, "subjectProfileId": 1}
    ):
        profile_ids.add(review["authorProfileId"])
        profile_ids.add(review["subjectProfileId"])
    return profile_ids


@dataclass(frozen=True)
class EvaluationResult:
    planted_n: int
    flagged_n: int
    caught_n: int
    false_positive_n: int
    precision: float | None
    recall: float
    detectable_ceiling_n: int | None = None
    detectable_recall: float | None = None


def evaluate_detector(
    scored_profiles: list[dict],
    colluder_profile_ids: set,
    detectable_profile_ids: set | None = None,
) -> EvaluationResult:
    """Precision/recall/counts of the detector's ``flagged`` decision against the
    planted colluder roster, plus (if given) recall restricted to the subset of
    colluders who had any chance of being caught at all.
    """
    flagged_ids = {row["profile_id"] for row in scored_profiles if row["flagged"]}
    caught = flagged_ids & colluder_profile_ids
    false_positives = flagged_ids - colluder_profile_ids
    planted_n = len(colluder_profile_ids)

    detectable_ceiling_n = None
    detectable_recall = None
    if detectable_profile_ids is not None:
        detectable_colluders = detectable_profile_ids & colluder_profile_ids
        detectable_ceiling_n = len(detectable_colluders)
        detectable_recall = (
            len(caught & detectable_colluders) / detectable_ceiling_n if detectable_ceiling_n else None
        )

    return EvaluationResult(
        planted_n=planted_n,
        flagged_n=len(flagged_ids),
        caught_n=len(caught),
        false_positive_n=len(false_positives),
        precision=(len(caught) / len(flagged_ids)) if flagged_ids else None,
        recall=(len(caught) / planted_n) if planted_n else 0.0,
        detectable_ceiling_n=detectable_ceiling_n,
        detectable_recall=detectable_recall,
    )


def random_baseline(
    scored_profiles: list[dict], colluder_profile_ids: set, flagged_n: int, *, seed: int = 42
) -> EvaluationResult:
    """A same-size random flag set drawn from the same scored population -- the
    same discipline as Gate A.3's permuted-label control: a detector that cannot
    beat this is not shown to have learned anything about collusion structure.
    """
    rng = random.Random(seed)
    population = [row["profile_id"] for row in scored_profiles]
    sample_size = min(flagged_n, len(population))
    flagged_ids = set(rng.sample(population, sample_size)) if sample_size else set()
    caught = flagged_ids & colluder_profile_ids
    planted_n = len(colluder_profile_ids)
    return EvaluationResult(
        planted_n=planted_n,
        flagged_n=len(flagged_ids),
        caught_n=len(caught),
        false_positive_n=len(flagged_ids - colluder_profile_ids),
        precision=(len(caught) / len(flagged_ids)) if flagged_ids else None,
        recall=(len(caught) / planted_n) if planted_n else 0.0,
    )
