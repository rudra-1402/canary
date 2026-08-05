from datetime import datetime

from generator.collusion_rings import build_collusion_rings
from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import draw_relative_conduct, generate_outcomes
from generator.proposals import generate_proposals
from generator.reviews import generate_reviews
from generator.ring_engagements import build_ring_engagements
from generator.timeline import build_timelines


def _base_dataset(num_profiles=5000, seed=42):
    config = GeneratorConfig(seed=seed, num_profiles=num_profiles)
    _, profiles = generate_identities_and_profiles(config)
    rings = build_collusion_rings(config, profiles)
    return config, profiles, rings


def test_builds_at_least_one_jobpost_proposal_engagement_triple_per_ring():
    config, profiles, rings = _base_dataset()
    now = datetime.utcnow()

    jobposts, proposals, engagements = build_ring_engagements(config, profiles, rings, now=now)

    assert len(rings) > 0
    ring_ids_with_engagement = set()
    profiles_by_id = {p["_localId"]: p for p in profiles}
    for engagement in engagements:
        freelancer_id = engagement["freelancerProfileLocalId"]
        client_id = engagement["clientProfileLocalId"]
        assert profiles_by_id[freelancer_id]["role"] == "freelancer"
        assert profiles_by_id[client_id]["role"] == "client"
    for ring in rings:
        members = set(ring["memberLocalIds"])
        for engagement in engagements:
            if {engagement["freelancerProfileLocalId"], engagement["clientProfileLocalId"]} <= members:
                ring_ids_with_engagement.add(ring["_localId"])
                break
    # Every role-mixed ring must get at least one internal engagement.
    assert ring_ids_with_engagement == {ring["_localId"] for ring in rings}


def test_produced_records_match_generator_shapes_and_reference_each_other():
    config, profiles, rings = _base_dataset()
    now = datetime.utcnow()
    jobposts, proposals, engagements = build_ring_engagements(config, profiles, rings, now=now)

    jobpost_ids = {jp["_localId"] for jp in jobposts}
    proposal_ids = {p["_localId"] for p in proposals}

    assert jobposts and proposals and engagements
    for jobpost in jobposts:
        assert jobpost["status"] == "closed"
        assert isinstance(jobpost["createdAt"], datetime)
        assert jobpost["createdAt"] <= now

    for proposal in proposals:
        assert proposal["status"] == "accepted"
        assert proposal["jobPostLocalId"] in jobpost_ids
        assert proposal["createdAt"] <= now

    for engagement in engagements:
        assert engagement["status"] in ("active", "concluded")
        assert engagement["proposalLocalId"] in proposal_ids
        assert engagement["jobPostLocalId"] in jobpost_ids
        assert engagement["createdAt"] <= now
        assert engagement["agreedTerms"]["dueAt"] >= engagement["createdAt"]

    # Every jobpost/proposal produced is consumed by exactly one engagement,
    # matching the one-accepted-proposal-per-jobpost invariant elsewhere.
    engaged_jobpost_ids = [e["jobPostLocalId"] for e in engagements]
    assert len(engaged_jobpost_ids) == len(set(engaged_jobpost_ids))


def test_concluded_ring_engagements_survive_the_real_conduct_and_timeline_pipeline():
    """Ring-forced engagements must flow through the same downstream functions
    as ordinary engagements without violating build_timelines' elapsed-time
    guard -- proving the forced chronology is not fabricated out of reach of
    'now'."""
    config, profiles, rings = _base_dataset(num_profiles=8000)
    now = datetime.utcnow()
    jobposts, proposals, engagements = build_ring_engagements(config, profiles, rings, now=now)

    conduct = draw_relative_conduct(config, profiles, engagements, now=now)
    timelines = build_timelines(config, engagements, conduct, now=now)  # must not raise
    outcomes = generate_outcomes(config, profiles, engagements, conduct=conduct, timelines=timelines, now=now)

    concluded_ids = {e["_localId"] for e in engagements if e["status"] == "concluded"}
    outcome_engagement_ids = {o["engagementLocalId"] for o in outcomes}
    assert concluded_ids <= outcome_engagement_ids


def test_large_majority_of_colluders_get_a_ring_internal_engagement_and_planted_review():
    """The end-to-end acceptance criterion from the defect report: almost all
    planted colluders must leave a real, reviewable fingerprint -- not just
    ring-label membership. Runs the full generator pipeline (no DB) with the
    ring engagements folded in exactly the way run.py will."""
    config = GeneratorConfig(seed=42, num_profiles=8000)
    now = datetime.utcnow()
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    rings = build_collusion_rings(config, profiles)

    # Only the engagement list feeds anything downstream; the ring jobposts and
    # proposals exist for persistence, not for this assertion.
    _, _, ring_engagements = build_ring_engagements(config, profiles, rings, now=now)
    all_engagements = engagements + ring_engagements

    conduct = draw_relative_conduct(config, profiles, all_engagements, now=now)
    timelines = build_timelines(config, all_engagements, conduct, now=now)
    outcomes = generate_outcomes(
        config, profiles, all_engagements, conduct=conduct, timelines=timelines, now=now
    )
    reviews = generate_reviews(
        config, profiles, all_engagements, outcomes, rings, timelines=timelines, now=now
    )

    colluder_ids = {p["_localId"] for p in profiles if p["trueArchetype"] == "colluder"}
    fingerprinted = {
        pid
        for review in reviews
        if review.get("isPlantedCollusion")
        for pid in (review["authorProfileLocalId"], review["subjectProfileLocalId"])
    }
    coverage = len(colluder_ids & fingerprinted) / len(colluder_ids)
    assert coverage >= 0.7, f"only {coverage:.1%} of colluders got a planted ring fingerprint"
