import argparse
import json
import random
import sys
from datetime import datetime

from bson import ObjectId

from generator.clock import resolve_now
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
from generator.ring_engagements import build_ring_engagements
from generator.timeline import build_timelines
from generator.validation import validate_dataset
from quality.gates import GateStatus, judge_ring_detectability

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


def _print_ring_detectability_result(result):
    if result.status is GateStatus.NOT_EVALUABLE:
        print(f"Gate ring-detectability: NOT EVALUABLE - {result.reason}")
        return
    if result.status is GateStatus.PASS:
        member_coverage = result.ranges["member_coverage"][0]
        ring_coverage = result.ranges["ring_coverage"][0]
        print(
            "Gate ring-detectability: PASS - ring-internal reciprocal-review fingerprint met "
            f"coverage floors (member_coverage={member_coverage:.1%}, ring_coverage={ring_coverage:.1%})"
        )


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


def _deterministic_object_ids(local_ids, config: GeneratorConfig, salt: str) -> dict:
    """Deterministic replacement for `ObjectId()` at persistence time.

    `ObjectId()` embeds a wall-clock timestamp plus `os.urandom` bytes, so two
    `generate()` calls at the same seed would otherwise diverge here even
    after every upstream document already matched byte-for-byte -- this is
    the second half of defect #6, not merely the `now` reads. Bytes are drawn
    from an RNG stream keyed on `(config.seed, salt)`, independent of every
    RNG used upstream in the generation path, so persistence id assignment
    can never perturb any distribution the generator already produced.
    """
    rng = random.Random(f"object-id:{config.seed}:{salt}")
    return {local_id: ObjectId(rng.randbytes(12)) for local_id in local_ids}


def _prepare_persistence_documents(
    identities,
    profiles,
    jobposts,
    proposals,
    engagements,
    outcomes,
    reviews,
    payments,
    config: GeneratorConfig,
):
    identity_ids = _deterministic_object_ids([i["_localId"] for i in identities], config, "identities")
    profile_ids = _deterministic_object_ids([p["_localId"] for p in profiles], config, "profiles")
    jobpost_ids = _deterministic_object_ids([j["_localId"] for j in jobposts], config, "jobposts")
    proposal_ids = _deterministic_object_ids([p["_localId"] for p in proposals], config, "proposals")
    engagement_ids = _deterministic_object_ids([e["_localId"] for e in engagements], config, "engagements")
    outcome_ids = _deterministic_object_ids([o["_localId"] for o in outcomes], config, "outcomes")
    review_ids = _deterministic_object_ids([r["_localId"] for r in reviews], config, "reviews")
    payment_ids = _deterministic_object_ids([p["_localId"] for p in payments], config, "payments")

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
            "_id": outcome_ids[outcome["_localId"]],
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
            "_id": review_ids[review["_localId"]],
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
            "_id": payment_ids[payment["_localId"]],
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


def _resolve_ids(
    db,
    identities,
    profiles,
    jobposts,
    proposals,
    engagements,
    outcomes,
    reviews,
    payments,
    *,
    config: GeneratorConfig | None = None,
):
    """Resolve every id, validate the complete write set, then insert in dependency order.

    `config` is keyword-only and defaults to a fresh `GeneratorConfig()` so
    existing callers that only care about mapping correctness (not
    reproducibility of the `_id`s themselves) are unaffected; callers that
    need `generate(seed) == generate(seed)` including `_id`s must pass the
    same `config` used for generation.
    """
    documents, profile_ids, jobpost_ids, engagement_ids = _prepare_persistence_documents(
        identities,
        profiles,
        jobposts,
        proposals,
        engagements,
        outcomes,
        reviews,
        payments,
        config or GeneratorConfig(),
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


def generate(config: GeneratorConfig, *, now: datetime | None = None) -> dict:
    """Run the full generation path in memory -- no database, no wall clock.

    This is the seam defect #6 was missing: `main()` used to inline every one
    of these calls, so there was no single unit that could be invoked twice
    and diffed to prove `generate(seed) == generate(seed)`. `now` is resolved
    exactly once, here, and threaded to every downstream call; nothing below
    this point reads `datetime.utcnow()`.
    """
    now = resolve_now(config, now)

    identities, profiles = generate_identities_and_profiles(config, now=now)
    jobposts = generate_jobposts(config, profiles, now=now)
    proposals = generate_proposals(config, profiles, jobposts, now=now)
    engagements = generate_engagements(config, profiles, jobposts, proposals, now=now)
    rings = build_collusion_rings(config, profiles)
    # Ring membership alone is a label, not a behaviour: without forcing real
    # ring-internal jobpost -> proposal -> engagement activity, ring-mates only
    # ever transact if the ordinary matching above pairs them by chance (it
    # measured at ~11% of planted colluders). These are merged in before
    # conduct/timelines/outcomes/reviews are computed so they flow through the
    # exact same downstream pipeline as organic engagements. Gated behind
    # `config.enable_ring_engagements` (default True == prior unconditional
    # behaviour) so callers can deliberately leave rings inert instead.
    if config.enable_ring_engagements:
        ring_jobposts, ring_proposals, ring_engagements = build_ring_engagements(
            config, profiles, rings, now=now
        )
        jobposts = jobposts + ring_jobposts
        proposals = proposals + ring_proposals
        engagements = engagements + ring_engagements
    conduct = draw_relative_conduct(config, profiles, engagements, now=now)
    timelines = build_timelines(config, engagements, conduct, now=now)
    outcomes = generate_outcomes(config, profiles, engagements, conduct=conduct, timelines=timelines, now=now)
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

    return {
        "now": now,
        "identities": identities,
        "profiles": profiles,
        "jobposts": jobposts,
        "proposals": proposals,
        "engagements": engagements,
        "rings": rings,
        "conduct": conduct,
        "timelines": timelines,
        "outcomes": outcomes,
        "reviews": reviews,
        "payments": payments,
        "manifest": manifest,
        "report": report,
    }


def main():
    parser = argparse.ArgumentParser(description="Seed Canary's synthetic marketplace")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-profiles", type=int, default=500)
    parser.add_argument(
        "--engagement-fanout-multiplier",
        type=float,
        default=8.0,
        help=(
            "Multiply JobPosts per client to raise seeded Engagement density. "
            "8.0 measured: at 3.0 only 19.9%% of profiles had enough history for a temporal "
            "split and the label was degenerate (one value on 54.9%%); at 8.0 it is 68.9%% "
            "and Gate 4b passes."
        ),
    )
    parser.add_argument("--wipe", action="store_true", help="Drop existing seeded collections first")
    parser.add_argument(
        "--disable-ring-engagements",
        action="store_true",
        help=(
            "Do not force ring-internal jobpost -> proposal -> engagement chains; "
            "planted collusion rings stay inert (organic-chance-only transacting), "
            "matching the pre-fix generator / current canary_a4_dense demo data. "
            "Default is False (ring engagements forced), the prior unconditional behaviour."
        ),
    )
    parser.add_argument("--manifest-out", default="ground-truth-manifest.json")
    parser.add_argument("--id-map-out", default="profile-id-map.json")
    parser.add_argument(
        "--now",
        default=None,
        help=(
            "ISO-8601 instant to use as the generation run's 'now', overriding the "
            "seed-derived default. Pin this to make two separate `run.py` invocations "
            "at the same --seed produce byte-identical output, including _id."
        ),
    )
    args = parser.parse_args()

    config = GeneratorConfig(
        seed=args.seed,
        num_profiles=args.num_profiles,
        engagement_fanout_multiplier=args.engagement_fanout_multiplier,
        enable_ring_engagements=not args.disable_ring_engagements,
    )
    db = get_database()

    if args.wipe:
        for name in COLLECTIONS:
            db[name].delete_many({})

    pinned_now = datetime.fromisoformat(args.now) if args.now else None
    dataset = generate(config, now=pinned_now)
    identities = dataset["identities"]
    profiles = dataset["profiles"]
    jobposts = dataset["jobposts"]
    proposals = dataset["proposals"]
    engagements = dataset["engagements"]
    rings = dataset["rings"]
    outcomes = dataset["outcomes"]
    reviews = dataset["reviews"]
    payments = dataset["payments"]
    manifest = dataset["manifest"]
    report = dataset["report"]

    if any(v > 0 for v in report["referentialIntegrity"].values()):
        print("Self-validation FAILED — aborting seed:", json.dumps(report, indent=2), file=sys.stderr)
        sys.exit(1)
    if report["ringSignatureCheck"]["ringsWithoutReciprocity"] > 0:
        print("Ring signature check FAILED — aborting seed:", json.dumps(report, indent=2), file=sys.stderr)
        sys.exit(1)
    # ringSignatureCheck above is purely structural (the graph nx object has
    # reciprocal edges) -- it would have passed on the pre-fix generator too,
    # since collusion_rings.py always built a fully-connected graph even
    # though nothing consumed it. This is the behavioural check: rings must
    # have actually left a detectable fingerprint in the emitted reviews.
    ring_detectability = judge_ring_detectability(
        rings, reviews, ring_engagements_enabled=config.enable_ring_engagements
    )
    _print_ring_detectability_result(ring_detectability)
    if ring_detectability.status is GateStatus.FAIL:
        print(
            "Ring detectability gate FAILED — aborting seed:",
            json.dumps(ring_detectability.failures, indent=2),
            file=sys.stderr,
        )
        sys.exit(1)
    reconciliation = report["manifestReconciliation"]
    if not (reconciliation["profileCountMatches"] and reconciliation["ringCountMatches"]):
        print(
            "Manifest reconciliation FAILED — aborting seed:", json.dumps(report, indent=2), file=sys.stderr
        )
        sys.exit(1)

    profile_local_to_real, _, _ = _resolve_ids(
        db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, payments, config=config
    )

    with open(args.manifest_out, "w") as f:
        json.dump(manifest, f, indent=2, default=str)
    write_id_map(args.id_map_out, profile_local_to_real)

    print(f"Seeded at {dataset['now'].isoformat()}Z")
    print(json.dumps(report["counts"], indent=2))
    print(f"Ground-truth manifest written to {args.manifest_out}")
    print(f"Profile id-map written to {args.id_map_out}")


if __name__ == "__main__":
    main()
