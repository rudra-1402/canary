from datetime import datetime
from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals
from generator.engagements import generate_engagements


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
