import argparse
import json
from datetime import datetime

from scipy.stats import spearmanr
from sklearn.model_selection import train_test_split

from generator.db import close_client, get_client
from trust_score.config import TrustScoreConfig
from trust_score.explain import build_explainer, explain_profile
from trust_score.features import compute_features
from trust_score.fetch import load_dataset
from trust_score.labels import bucket_label, compute_reliability_index
from trust_score.model import is_cold_start, score_profile, train_model

ROLES = ["freelancer", "client"]

# Only the three organic reliability classes -- colluder/saboteur are
# deliberately excluded (they get modestly elevated surface traits on
# purpose, so Slice 1's undiscounted score isn't expected to rank them low;
# that's a later slice's gaming-discount job, not this evaluation's).
SEVERITY_ORDER = {"bad-actor": 0, "risky": 1, "reliable": 2}


def load_manifest_and_id_map(manifest_path: str, id_map_path: str):
    with open(manifest_path) as f:
        manifest = json.load(f)
    with open(id_map_path) as f:
        id_map = json.load(f)
    manifest_by_local = {p["profileLocalId"]: p for p in manifest["profiles"]}
    real_to_local = {v: k for k, v in id_map.items()}
    return manifest_by_local, real_to_local


def _rank_correlation(scored_test: list[dict]):
    relevant = [r for r in scored_test if r["trueArchetype"] in SEVERITY_ORDER]
    if len(relevant) < 2:
        return None
    severities = [SEVERITY_ORDER[r["trueArchetype"]] for r in relevant]
    scores = [r["predicted_score"] for r in relevant]
    if len(set(severities)) < 2 or len(set(scores)) < 2:
        return None
    corr, _ = spearmanr(scores, severities)
    return corr


def _bad_actor_precision_recall(scored_test: list[dict]):
    bad_actors = [r for r in scored_test if r["trueArchetype"] == "bad-actor"]
    if not bad_actors:
        return {"planted": 0, "caught": 0, "recall": None}
    caught = sum(1 for r in bad_actors if r["predicted_level"] == "low")
    return {"planted": len(bad_actors), "caught": caught, "recall": caught / len(bad_actors)}


def _check_determinism(train_rows: list[dict], config) -> bool:
    features = [r["features"] for r in train_rows]
    labels = [r["label"] for r in train_rows]
    model_a = train_model(features, labels, config)
    model_b = train_model(features, labels, config)
    sample = features[:5]
    results_a = [score_profile(model_a, f) for f in sample]
    results_b = [score_profile(model_b, f) for f in sample]
    return results_a == results_b


def shap_sanity_check(model, explainer, scored_test: list[dict], n: int = 5) -> list[dict]:
    bad_actors = [r for r in scored_test if r["trueArchetype"] == "bad-actor"][:n]
    report = []
    for row in bad_actors:
        signals = explain_profile(explainer, row["features"])
        has_unfavorable = any(s["direction"] == "unfavorable" for s in signals)
        report.append(
            {
                "profile_id": str(row["profile_id"]),
                "top_signals": signals,
                "flagged_a_negative_signal": has_unfavorable,
            }
        )
    return report


def evaluate_role(db, role: str, config, manifest_by_local: dict, real_to_local: dict, now=None) -> dict:
    now = now or datetime.utcnow()
    dataset = load_dataset(db)
    role_profiles = [p for p in dataset["profiles"] if p["role"] == role]

    rows = []
    for profile in role_profiles:
        outcomes = dataset["outcomes_by_profile"].get(profile["_id"], [])
        reviews = dataset["reviews_by_subject"].get(profile["_id"], [])
        features = compute_features(outcomes, reviews, now, config)
        if is_cold_start(features, config):
            continue
        local_id = real_to_local.get(str(profile["_id"]))
        manifest_entry = manifest_by_local.get(local_id) if local_id else None
        if manifest_entry is None:
            continue
        rows.append(
            {
                "profile_id": profile["_id"],
                "features": features,
                "label": bucket_label(compute_reliability_index(features)),
                "trueArchetype": manifest_entry["trueArchetype"],
            }
        )

    if len(rows) < 4:
        return {
            "role": role,
            "test_size": 0,
            "rank_correlation": None,
            "bad_actor_precision_recall": {"planted": 0, "caught": 0, "recall": None},
            "determinism_ok": None,
            "model": None,
            "explainer": None,
            "test_rows": [],
        }

    labels_for_split = [r["label"] for r in rows]
    stratify = labels_for_split if len(set(labels_for_split)) > 1 else None
    train_rows, test_rows = train_test_split(
        rows, test_size=config.eval_test_size, random_state=config.seed, stratify=stratify
    )

    model = train_model([r["features"] for r in train_rows], [r["label"] for r in train_rows], config)
    explainer = build_explainer(model)

    scored_test = []
    for row in test_rows:
        scored = score_profile(model, row["features"])
        scored_test.append({**row, "predicted_score": scored["score"], "predicted_level": scored["level"]})

    return {
        "role": role,
        "test_size": len(scored_test),
        "rank_correlation": _rank_correlation(scored_test),
        "bad_actor_precision_recall": _bad_actor_precision_recall(scored_test),
        "determinism_ok": _check_determinism(train_rows, config),
        "model": model,
        "explainer": explainer,
        "test_rows": scored_test,
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate the Trust Score engine against ground truth")
    parser.add_argument("--manifest", default="ground-truth-manifest.json")
    parser.add_argument("--id-map", default="profile-id-map.json")
    args = parser.parse_args()

    config = TrustScoreConfig()
    client = get_client()
    db = client.get_default_database()
    manifest_by_local, real_to_local = load_manifest_and_id_map(args.manifest, args.id_map)

    for role in ROLES:
        result = evaluate_role(db, role, config, manifest_by_local, real_to_local)
        print(f"\n=== {role.upper()} Trust Score evaluation ===")
        print(f"Test set size: {result['test_size']}")
        corr = result["rank_correlation"]
        if corr is not None:
            print(f"Rank correlation (predicted score vs true severity): {corr:.3f}")
        else:
            print("Rank correlation: n/a (insufficient class diversity)")
        pr = result["bad_actor_precision_recall"]
        if pr["planted"]:
            print(f"Bad-actor recall: planted {pr['planted']}, caught {pr['caught']} ({pr['recall']:.0%})")
        else:
            print("Bad-actor recall: no bad-actor profiles in this role's test set")
        determinism = result["determinism_ok"]
        print(f"Determinism check: {'PASS' if determinism else 'FAIL' if determinism is not None else 'n/a'}")
        if result["model"] is not None:
            sanity = shap_sanity_check(result["model"], result["explainer"], result["test_rows"])
            flagged = sum(1 for s in sanity if s["flagged_a_negative_signal"])
            print(
                f"SHAP sanity spot-check: {flagged}/{len(sanity)} known bad actors "
                "had an unfavorable top signal"
            )

    close_client(client)


if __name__ == "__main__":
    main()
