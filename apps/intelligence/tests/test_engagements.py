from datetime import datetime, timedelta

from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals


def test_engagements_accept_exactly_one_proposal_per_jobpost():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)

    jobpost_ids_with_engagement = [e["jobPostLocalId"] for e in engagements if e["jobPostLocalId"]]
    assert len(jobpost_ids_with_engagement) == len(set(jobpost_ids_with_engagement))


def test_engagements_are_timestamped_across_the_timeline():
    config = GeneratorConfig(seed=42, num_profiles=200, timeline_months=18)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)

    now = datetime.utcnow()
    for e in engagements:
        assert e["createdAt"] <= now
        assert (now - e["createdAt"]).days <= config.timeline_months * 31


def test_bad_terms_good_person_pattern_is_planted():
    config = GeneratorConfig(seed=42, num_profiles=300)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)

    reliable_client_ids = {
        p["_localId"] for p in profiles if p["role"] == "client" and p["trueArchetype"] == "reliable"
    }
    bad_terms_on_reliable = [
        e for e in engagements if e.get("badTerms") and e["clientProfileLocalId"] in reliable_client_ids
    ]
    assert len(bad_terms_on_reliable) > 0


def test_engagement_terms_are_derived_from_the_accepted_proposal():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)

    proposals_by_local_id = {proposal["_localId"]: proposal for proposal in proposals}
    non_prospective_engagements = [e for e in engagements if e["status"] != "prospective"]
    revisions = []

    assert non_prospective_engagements
    for engagement in non_prospective_engagements:
        accepted_proposal = proposals_by_local_id[engagement["proposalLocalId"]]
        due_at = engagement["agreedTerms"]["dueAt"]
        revisions_included = engagement["agreedTerms"]["revisionsIncluded"]

        assert due_at == engagement["createdAt"] + timedelta(days=accepted_proposal["proposedDurationDays"])
        assert due_at >= engagement["createdAt"]
        assert isinstance(revisions_included, int)
        assert revisions_included >= 0
        revisions.append(revisions_included)

    assert len(set(revisions)) > 1


def test_accepted_proposals_and_their_jobposts_leave_their_initial_states():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)

    proposals_by_id = {proposal["_localId"]: proposal for proposal in proposals}
    proposals_by_jobpost = {}
    for proposal in proposals:
        proposals_by_jobpost.setdefault(proposal["jobPostLocalId"], []).append(proposal)
    jobposts_by_id = {jobpost["_localId"]: jobpost for jobpost in jobposts}

    assert engagements
    for engagement in engagements:
        assert proposals_by_id[engagement["proposalLocalId"]]["status"] == "accepted"
        assert all(
            proposal["status"] == "declined"
            for proposal in proposals_by_jobpost[engagement["jobPostLocalId"]]
            if proposal["_localId"] != engagement["proposalLocalId"]
        )
        assert jobposts_by_id[engagement["jobPostLocalId"]]["status"] == "closed"


def test_jobpost_proposal_and_engagement_lifecycles_all_have_multiple_statuses():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)

    assert len({jobpost["status"] for jobpost in jobposts}) > 1
    assert len({proposal["status"] for proposal in proposals}) > 1
    assert len({engagement["status"] for engagement in engagements}) > 1
