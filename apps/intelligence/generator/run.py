import argparse
import json
import sys
from datetime import datetime

from generator.collusion_rings import build_collusion_rings
from generator.config import GeneratorConfig
from generator.db import get_database
from generator.engagements import generate_engagements
from generator.id_map import write_id_map
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.manifest import build_manifest
from generator.outcomes import generate_outcomes
from generator.payments import generate_payments
from generator.proposals import generate_proposals
from generator.reviews import generate_reviews
from generator.validation import validate_dataset

COLLECTIONS = [
    "identities",
    "profiles",
    "jobposts",
    "proposals",
    "engagements",
    "outcomes",
    "reviews",
    "payments",
]


def _resolve_ids(db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, payments):
    """Insert in dependency order, mapping each _localId to the real Mongo _id."""
    identity_local_to_real = {}
    for identity in identities:
        doc = {k: v for k, v in identity.items() if not k.startswith("_")}
        result = db.identities.insert_one(doc)
        identity_local_to_real[identity["_localId"]] = result.inserted_id

    profile_local_to_real = {}
    for p in profiles:
        doc = {
            k: v
            for k, v in p.items()
            if not k.startswith("_") and k not in ("identityLocalId", "trueArchetype")
        }
        doc["identityId"] = identity_local_to_real[p["identityLocalId"]]
        result = db.profiles.insert_one(doc)
        profile_local_to_real[p["_localId"]] = result.inserted_id

    jobpost_local_to_real = {}
    for jp in jobposts:
        doc = {k: v for k, v in jp.items() if not k.startswith("_") and k != "plantedRedFlags"}
        doc["clientProfileId"] = profile_local_to_real[jp["clientProfileLocalId"]]
        del doc["clientProfileLocalId"]
        result = db.jobposts.insert_one(doc)
        jobpost_local_to_real[jp["_localId"]] = result.inserted_id

    proposal_local_to_real = {}
    for pr in proposals:
        doc = {k: v for k, v in pr.items() if not k.startswith("_")}
        doc["jobPostId"] = jobpost_local_to_real[pr["jobPostLocalId"]]
        doc["freelancerProfileId"] = profile_local_to_real[pr["freelancerProfileLocalId"]]
        del doc["jobPostLocalId"], doc["freelancerProfileLocalId"]
        result = db.proposals.insert_one(doc)
        proposal_local_to_real[pr["_localId"]] = result.inserted_id

    engagement_local_to_real = {}
    for e in engagements:
        doc = {
            "freelancerProfileId": profile_local_to_real[e["freelancerProfileLocalId"]],
            "clientProfileId": profile_local_to_real[e["clientProfileLocalId"]],
            "jobPostId": jobpost_local_to_real.get(e["jobPostLocalId"]),
            "proposalId": proposal_local_to_real.get(e["proposalLocalId"]),
            "status": e["status"],
            "agreedTerms": e["agreedTerms"],
            "createdAt": e["createdAt"],
        }
        result = db.engagements.insert_one(doc)
        engagement_local_to_real[e["_localId"]] = result.inserted_id

    # Mongoose's `timestamps:true`/`default: Date.now` never fire for these raw
    # pymongo inserts (same bypass already fixed once for Profile/JobPost/
    # Proposal) — Outcome and Payment below set createdAt explicitly rather than
    # relying on it. Outcome has no timing of its own in the generator's output,
    # so it inherits its engagement's createdAt as a reasonable stand-in for
    # "recorded around when the engagement concluded."
    engagements_by_local_id = {e["_localId"]: e for e in engagements}

    for o in outcomes:
        source_engagement = engagements_by_local_id[o["engagementLocalId"]]
        doc = {
            "engagementId": engagement_local_to_real[o["engagementLocalId"]],
            "paidInFull": o["paidInFull"],
            "daysLate": o["daysLate"],
            "scopeCreepOccurred": o["scopeCreepOccurred"],
            "ghosted": o["ghosted"],
            "endedAs": o["endedAs"],
            "labelSource": o["labelSource"],
            "recordedAt": source_engagement["createdAt"],
            "createdAt": source_engagement["createdAt"],
        }
        db.outcomes.insert_one(doc)

    for r in reviews:
        source_engagement = engagements_by_local_id[r["engagementLocalId"]]
        doc = {
            "engagementId": engagement_local_to_real[r["engagementLocalId"]],
            "authorProfileId": profile_local_to_real[r["authorProfileLocalId"]],
            "subjectProfileId": profile_local_to_real[r["subjectProfileLocalId"]],
            "rating": r["rating"],
            "text": r["text"],
            "createdAt": source_engagement["createdAt"],
        }
        db.reviews.insert_one(doc)

    for pay in payments:
        doc = {
            "freelancerProfileId": profile_local_to_real[pay["freelancerProfileLocalId"]],
            "engagementId": engagement_local_to_real.get(pay["engagementLocalId"]),
            "amount": pay["amount"],
            "receivedAt": pay["receivedAt"],
            "importSource": pay["importSource"],
            "createdAt": pay["receivedAt"],
        }
        db.payments.insert_one(doc)

    return profile_local_to_real, jobpost_local_to_real, engagement_local_to_real


def main():
    parser = argparse.ArgumentParser(description="Seed Canary's synthetic marketplace")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-profiles", type=int, default=500)
    parser.add_argument("--wipe", action="store_true", help="Drop existing seeded collections first")
    parser.add_argument("--manifest-out", default="ground-truth-manifest.json")
    parser.add_argument("--id-map-out", default="profile-id-map.json")
    args = parser.parse_args()

    config = GeneratorConfig(seed=args.seed, num_profiles=args.num_profiles)
    db = get_database()

    if args.wipe:
        for name in COLLECTIONS:
            db[name].delete_many({})

    identities, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    rings = build_collusion_rings(config, profiles)
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    payments = generate_payments(config, profiles, engagements, outcomes)

    # Build the manifest before writing anything — validation and the manifest
    # must agree on the same data, and nothing gets inserted if either check fails.
    # Both calls use keyword arguments — build_manifest/validate_dataset are
    # keyword-only.
    manifest = build_manifest(
        config=config,
        profiles=profiles,
        jobposts=jobposts,
        engagements=engagements,
        outcomes=outcomes,
        reviews=reviews,
        rings=rings,
    )
    report = validate_dataset(
        profiles=profiles,
        jobposts=jobposts,
        proposals=proposals,
        engagements=engagements,
        outcomes=outcomes,
        reviews=reviews,
        rings=rings,
        manifest=manifest,
    )
    if any(v > 0 for v in report["referentialIntegrity"].values()):
        print("Self-validation FAILED — aborting seed:", json.dumps(report, indent=2), file=sys.stderr)
        sys.exit(1)
    if report["ringSignatureCheck"]["ringsWithoutReciprocity"] > 0:
        print("Ring signature check FAILED — aborting seed:", json.dumps(report, indent=2), file=sys.stderr)
        sys.exit(1)
    reconciliation = report["manifestReconciliation"]
    if not (reconciliation["profileCountMatches"] and reconciliation["ringCountMatches"]):
        print(
            "Manifest reconciliation FAILED — aborting seed:", json.dumps(report, indent=2), file=sys.stderr
        )
        sys.exit(1)

    profile_local_to_real, _, _ = _resolve_ids(
        db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, payments
    )

    with open(args.manifest_out, "w") as f:
        json.dump(manifest, f, indent=2, default=str)
    write_id_map(args.id_map_out, profile_local_to_real)

    print(f"Seeded at {datetime.utcnow().isoformat()}Z")
    print(json.dumps(report["counts"], indent=2))
    print(f"Ground-truth manifest written to {args.manifest_out}")
    print(f"Profile id-map written to {args.id_map_out}")


if __name__ == "__main__":
    main()
