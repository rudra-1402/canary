import argparse
import json
import sys
from datetime import datetime

from bson import ObjectId

from generator.collusion_rings import build_collusion_rings
from generator.config import GeneratorConfig
from generator.db import get_database
from generator.engagements import generate_engagements
from generator.id_map import write_id_map
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.manifest import build_manifest
from generator.outcomes import draw_relative_conduct, generate_outcomes
from generator.payments import generate_payments
from generator.proposals import generate_proposals
from generator.reviews import generate_reviews
from generator.timeline import build_timelines
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

# Kept as a separate, explicit list so the test suite makes a newly-written
# collection opt into validation deliberately rather than silently bypassing it.
PERSISTENCE_VALIDATION_COLLECTIONS = [
    "identities",
    "profiles",
    "jobposts",
    "proposals",
    "engagements",
    "outcomes",
    "reviews",
    "payments",
]


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_required(document, collection, index, field, expected_type):
    value = document.get(field)
    if value is None:
        raise ValueError(f"{collection}[{index}].{field} is required")
    if expected_type is _is_number:
        valid = _is_number(value)
    else:
        valid = isinstance(value, expected_type)
    if not valid:
        raise ValueError(f"{collection}[{index}].{field} has invalid type")


def _validate_enum(document, collection, index, field, values):
    if document.get(field) not in values:
        raise ValueError(f"{collection}[{index}].{field} has an invalid value")


def _validate_optional(document, collection, index, field, expected_type):
    if field not in document or document[field] is None:
        return
    _validate_required(document, collection, index, field, expected_type)


def _validate_structural_document(collection, document, index):
    required_fields = {
        "identities": {
            "email": str,
            "passwordHash": str,
            "emailVerified": bool,
            "activeProfileId": ObjectId,
            "createdAt": datetime,
        },
        "profiles": {
            "identityId": ObjectId,
            "role": str,
            "origin": str,
            "displayName": str,
            "createdAt": datetime,
        },
        "jobposts": {
            "clientProfileId": ObjectId,
            "title": str,
            "category": str,
            "description": str,
            "skills": list,
            "jobType": str,
            "budgetOrRate": _is_number,
            "experienceLevel": str,
            "projectLength": str,
            "status": str,
            "createdAt": datetime,
        },
        "proposals": {
            "jobPostId": ObjectId,
            "freelancerProfileId": ObjectId,
            "bid": _is_number,
            "payModel": str,
            "proposedDurationDays": int,
            "status": str,
            "createdAt": datetime,
        },
        "engagements": {
            "freelancerProfileId": ObjectId,
            "clientProfileId": ObjectId,
            "status": str,
            "createdAt": datetime,
        },
        "outcomes": {
            "engagementId": ObjectId,
            "subjectProfileId": ObjectId,
            "counterpartyProfileId": ObjectId,
            "subjectRole": str,
            "observed": bool,
            "ghosted": bool,
            "endedAs": str,
            "labelSource": str,
            "recordedAt": datetime,
            "createdAt": datetime,
        },
        "reviews": {
            "engagementId": ObjectId,
            "authorProfileId": ObjectId,
            "subjectProfileId": ObjectId,
            "rating": _is_number,
            "visibleAt": datetime,
            "isPlantedCollusion": bool,
            "isPlantedSabotage": bool,
            "createdAt": datetime,
        },
        "payments": {
            "freelancerProfileId": ObjectId,
            "amount": _is_number,
            "receivedAt": datetime,
            "importSource": str,
            "createdAt": datetime,
        },
    }
    for field, expected_type in required_fields[collection].items():
        _validate_required(document, collection, index, field, expected_type)

    enum_fields = {
        "profiles": {"role": {"freelancer", "client"}, "origin": {"user-registered", "synthetic-seeded"}},
        "jobposts": {
            "jobType": {"hourly", "fixed"},
            "experienceLevel": {"entry", "intermediate", "expert"},
            "projectLength": {"less-than-1-month", "1-to-3-months", "3-to-6-months", "more-than-6-months"},
            "status": {"draft", "open", "closed"},
        },
        "proposals": {
            "payModel": {"project", "milestone"},
            "status": {"submitted", "shortlisted", "accepted", "declined", "withdrawn"},
        },
        "engagements": {"status": {"prospective", "active", "concluded"}},
        "outcomes": {
            "subjectRole": {"freelancer", "client"},
            "endedAs": {"completed", "cancelled", "ghosted"},
            "labelSource": {"synthetic", "heuristic", "self-reported"},
        },
        "payments": {"importSource": {"manual", "csv", "stripe-test"}},
    }
    for field, values in enum_fields.get(collection, {}).items():
        _validate_enum(document, collection, index, field, values)

    optional_fields = {
        "identities": {
            "phone": str,
            "authProviderId": str,
            "passwordHash": str,
            "emailVerified": bool,
            "activeProfileId": ObjectId,
        },
        "profiles": {
            "discoverable": bool,
            "businessName": str,
            "paymentVerified": bool,
            "verificationStatus": str,
            "onboardingCompletedAt": datetime,
            "hourlyRate": _is_number,
            "portfolio": list,
            "workHistory": list,
            "certifications": list,
            "languages": list,
            "availableForWork": bool,
            "country": str,
            "taxRatePct": _is_number,
            "industry": str,
            "typicalBudget": _is_number,
            "paymentTermsNorm": str,
        },
        "jobposts": {"hoursPerWeek": _is_number, "screeningQuestions": list},
        "proposals": {
            "proposedMilestones": list,
            "durationEstimate": str,
            "coverLetter": str,
            "screeningAnswers": list,
        },
        "engagements": {"jobPostId": ObjectId, "proposalId": ObjectId},
        "reviews": {"text": str},
        "payments": {"engagementId": ObjectId},
    }
    for field, expected_type in optional_fields.get(collection, {}).items():
        _validate_optional(document, collection, index, field, expected_type)

    if collection == "profiles" and document.get("verificationStatus") not in (None, "none", "id-verified"):
        raise ValueError(f"{collection}[{index}].verificationStatus has an invalid value")

    if collection == "engagements" and document["status"] != "prospective":
        _validate_required(document, collection, index, "agreedTerms", dict)
        for field, expected_type in {
            "scope": str,
            "price": _is_number,
            "paymentTerms": str,
            "timeline": str,
            "dueAt": datetime,
            "revisionsIncluded": int,
        }.items():
            value = document["agreedTerms"].get(field)
            if value is None:
                raise ValueError(f"{collection}[{index}].agreedTerms.{field} is required")
            if expected_type is _is_number:
                valid = _is_number(value)
            else:
                valid = isinstance(value, expected_type)
            if not valid:
                raise ValueError(f"{collection}[{index}].agreedTerms.{field} has invalid type")

    if collection == "reviews" and not 1 <= document["rating"] <= 5:
        raise ValueError(f"{collection}[{index}].rating has an invalid value")

    if collection == "outcomes":
        nullable_types = {
            "deliveredAt": datetime,
            "paidInFull": bool,
            "daysLate": _is_number,
            "revisionsRequested": int,
            "scopeCreepOccurred": bool,
        }
        for field, expected_type in nullable_types.items():
            value = document.get(field)
            if value is not None:
                _validate_required(document, collection, index, field, expected_type)


def _validate_relational_documents(documents):
    engagements_by_id = {document["_id"]: document for document in documents["engagements"]}
    profiles_by_id = {document["_id"]: document for document in documents["profiles"]}
    proposals_by_id = {document["_id"]: document for document in documents["proposals"]}
    jobposts_by_id = {document["_id"]: document for document in documents["jobposts"]}
    outcomes_by_engagement = {}
    seen_review_authors = set()

    for index, identity in enumerate(documents["identities"]):
        active_profile = profiles_by_id.get(identity["activeProfileId"])
        if active_profile is None or active_profile["identityId"] != identity["_id"]:
            raise ValueError(f"identities[{index}].activeProfileId must reference an owned Profile")

    for index, engagement in enumerate(documents["engagements"]):
        proposal = proposals_by_id.get(engagement["proposalId"])
        if proposal is None:
            raise ValueError(f"engagements[{index}].proposalId does not reference a Proposal")
        if proposal["status"] != "accepted":
            raise ValueError(f"engagements[{index}].proposalId must reference an accepted Proposal")
        if engagement["status"] == "concluded":
            jobpost = jobposts_by_id.get(engagement["jobPostId"])
            if jobpost is None or jobpost["status"] == "open":
                raise ValueError(f"engagements[{index}].jobPostId must not reference an open JobPost")

    for index, outcome in enumerate(documents["outcomes"]):
        engagement = engagements_by_id.get(outcome["engagementId"])
        if engagement is None:
            raise ValueError(f"outcomes[{index}].engagementId does not reference an Engagement")
        parties = {engagement["freelancerProfileId"], engagement["clientProfileId"]}
        if outcome["subjectProfileId"] not in parties:
            raise ValueError(f"outcomes[{index}].subjectProfileId is not a party to its Engagement")
        if outcome["counterpartyProfileId"] not in parties:
            raise ValueError(f"outcomes[{index}].counterpartyProfileId is not a party to its Engagement")
        if outcome["subjectProfileId"] == outcome["counterpartyProfileId"]:
            raise ValueError(f"outcomes[{index}].counterpartyProfileId must differ from subjectProfileId")
        outcomes_by_engagement.setdefault(outcome["engagementId"], []).append(outcome)

    for engagement in documents["engagements"]:
        if (
            engagement["status"] == "concluded"
            and len(outcomes_by_engagement.get(engagement["_id"], [])) != 2
        ):
            raise ValueError(f"engagements.{engagement['_id']} must have exactly two Outcomes")

    for index, review in enumerate(documents["reviews"]):
        engagement = engagements_by_id.get(review["engagementId"])
        if engagement is None:
            raise ValueError(f"reviews[{index}].engagementId does not reference an Engagement")
        parties = {engagement["freelancerProfileId"], engagement["clientProfileId"]}
        if review["authorProfileId"] not in parties:
            raise ValueError(f"reviews[{index}].authorProfileId is not a party to its Engagement")
        if review["subjectProfileId"] not in parties:
            raise ValueError(f"reviews[{index}].subjectProfileId is not a party to its Engagement")
        if review["authorProfileId"] == review["subjectProfileId"]:
            raise ValueError(f"reviews[{index}].subjectProfileId must be opposite the authorProfileId")
        author_key = (review["engagementId"], review["authorProfileId"])
        if author_key in seen_review_authors:
            raise ValueError(f"reviews[{index}].authorProfileId has already reviewed this Engagement")
        seen_review_authors.add(author_key)


def validate_persistence_documents(documents):
    if list(documents) != PERSISTENCE_VALIDATION_COLLECTIONS:
        raise ValueError("Persistence documents must cover every written collection")
    for collection in PERSISTENCE_VALIDATION_COLLECTIONS:
        for index, document in enumerate(documents[collection]):
            _validate_structural_document(collection, document, index)
    _validate_relational_documents(documents)


def _prepare_persistence_documents(
    identities, profiles, jobposts, proposals, engagements, outcomes, reviews, payments
):
    identity_ids = {identity["_localId"]: ObjectId() for identity in identities}
    profile_ids = {profile["_localId"]: ObjectId() for profile in profiles}
    jobpost_ids = {jobpost["_localId"]: ObjectId() for jobpost in jobposts}
    proposal_ids = {proposal["_localId"]: ObjectId() for proposal in proposals}
    engagement_ids = {engagement["_localId"]: ObjectId() for engagement in engagements}

    documents = {collection: [] for collection in PERSISTENCE_VALIDATION_COLLECTIONS}
    documents["identities"] = [
        {
            "_id": identity_ids[identity["_localId"]],
            **{k: v for k, v in identity.items() if not k.startswith("_") and k != "activeProfileLocalId"},
            "activeProfileId": profile_ids.get(identity.get("activeProfileLocalId")),
        }
        for identity in identities
    ]
    documents["profiles"] = [
        {
            "_id": profile_ids[profile["_localId"]],
            **{
                k: v
                for k, v in profile.items()
                if not k.startswith("_") and k not in ("identityLocalId", "trueArchetype")
            },
            "identityId": identity_ids.get(profile.get("identityLocalId")),
        }
        for profile in profiles
    ]
    documents["jobposts"] = [
        {
            "_id": jobpost_ids[jobpost["_localId"]],
            **{
                k: v
                for k, v in jobpost.items()
                if not k.startswith("_") and k not in ("clientProfileLocalId", "plantedRedFlags")
            },
            "clientProfileId": profile_ids.get(jobpost.get("clientProfileLocalId")),
        }
        for jobpost in jobposts
    ]
    documents["proposals"] = [
        {
            "_id": proposal_ids[proposal["_localId"]],
            **{
                k: v
                for k, v in proposal.items()
                if not k.startswith("_") and k not in ("jobPostLocalId", "freelancerProfileLocalId")
            },
            "jobPostId": jobpost_ids.get(proposal.get("jobPostLocalId")),
            "freelancerProfileId": profile_ids.get(proposal.get("freelancerProfileLocalId")),
        }
        for proposal in proposals
    ]
    documents["engagements"] = [
        {
            "_id": engagement_ids[engagement["_localId"]],
            "freelancerProfileId": profile_ids.get(engagement.get("freelancerProfileLocalId")),
            "clientProfileId": profile_ids.get(engagement.get("clientProfileLocalId")),
            "jobPostId": jobpost_ids.get(engagement.get("jobPostLocalId")),
            "proposalId": proposal_ids.get(engagement.get("proposalLocalId")),
            "status": engagement.get("status"),
            "agreedTerms": engagement.get("agreedTerms"),
            "createdAt": engagement.get("createdAt"),
        }
        for engagement in engagements
    ]
    documents["outcomes"] = [
        {
            "engagementId": engagement_ids.get(outcome.get("engagementLocalId")),
            "subjectProfileId": profile_ids.get(outcome.get("subjectProfileLocalId")),
            "counterpartyProfileId": profile_ids.get(outcome.get("counterpartyProfileLocalId")),
            "subjectRole": outcome.get("subjectRole"),
            "observed": outcome.get("observed"),
            "deliveredAt": outcome.get("deliveredAt"),
            "paidInFull": outcome.get("paidInFull"),
            "daysLate": outcome.get("daysLate"),
            "revisionsRequested": outcome.get("revisionsRequested"),
            "scopeCreepOccurred": outcome.get("scopeCreepOccurred"),
            "ghosted": outcome.get("ghosted"),
            "endedAs": outcome.get("endedAs"),
            "labelSource": outcome.get("labelSource"),
            "recordedAt": outcome.get("recordedAt"),
            "createdAt": outcome.get("recordedAt"),
        }
        for outcome in outcomes
    ]
    documents["reviews"] = [
        {
            "engagementId": engagement_ids.get(review.get("engagementLocalId")),
            "authorProfileId": profile_ids.get(review.get("authorProfileLocalId")),
            "subjectProfileId": profile_ids.get(review.get("subjectProfileLocalId")),
            "rating": review.get("rating"),
            "text": review.get("text"),
            "isPlantedCollusion": review.get("isPlantedCollusion"),
            "isPlantedSabotage": review.get("isPlantedSabotage"),
            "createdAt": review.get("createdAt"),
            "visibleAt": review.get("visibleAt"),
        }
        for review in reviews
    ]
    documents["payments"] = [
        {
            "freelancerProfileId": profile_ids.get(payment.get("freelancerProfileLocalId")),
            "engagementId": engagement_ids.get(payment.get("engagementLocalId")),
            "amount": payment.get("amount"),
            "receivedAt": payment.get("receivedAt"),
            "importSource": payment.get("importSource"),
            "createdAt": payment.get("receivedAt"),
        }
        for payment in payments
    ]
    return documents, profile_ids, jobpost_ids, engagement_ids


def _resolve_ids(db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, payments):
    """Resolve every id, validate the complete write set, then insert in dependency order."""
    documents, profile_ids, jobpost_ids, engagement_ids = _prepare_persistence_documents(
        identities, profiles, jobposts, proposals, engagements, outcomes, reviews, payments
    )
    validate_persistence_documents(documents)
    for collection in COLLECTIONS:
        for document in documents[collection]:
            (
                db[collection].insert_one(document)
                if isinstance(db, dict)
                else getattr(db, collection).insert_one(document)
            )
    return profile_ids, jobpost_ids, engagement_ids


def main():
    parser = argparse.ArgumentParser(description="Seed Canary's synthetic marketplace")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-profiles", type=int, default=500)
    parser.add_argument(
        "--engagement-fanout-multiplier",
        type=float,
        default=3.0,
        help="Multiply JobPosts per client to raise seeded Engagement density",
    )
    parser.add_argument("--wipe", action="store_true", help="Drop existing seeded collections first")
    parser.add_argument("--manifest-out", default="ground-truth-manifest.json")
    parser.add_argument("--id-map-out", default="profile-id-map.json")
    args = parser.parse_args()

    config = GeneratorConfig(
        seed=args.seed,
        num_profiles=args.num_profiles,
        engagement_fanout_multiplier=args.engagement_fanout_multiplier,
    )
    db = get_database()

    if args.wipe:
        for name in COLLECTIONS:
            db[name].delete_many({})

    identities, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    now = datetime.utcnow()
    conduct = draw_relative_conduct(config, profiles, engagements, now=now)
    timelines = build_timelines(config, engagements, conduct, now=now)
    outcomes = generate_outcomes(config, profiles, engagements, conduct=conduct, timelines=timelines, now=now)
    rings = build_collusion_rings(config, profiles)
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings, timelines=timelines, now=now)
    payments = generate_payments(config, profiles, engagements, conduct, timelines, now=now)

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
