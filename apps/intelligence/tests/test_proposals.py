from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals


def test_proposals_reference_valid_jobposts_and_freelancers():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)

    jobpost_ids = {jp["_localId"] for jp in jobposts}
    freelancer_ids = {p["_localId"] for p in profiles if p["role"] == "freelancer"}

    assert len(proposals) > 0
    for proposal in proposals:
        assert proposal["jobPostLocalId"] in jobpost_ids
        assert proposal["freelancerProfileLocalId"] in freelancer_ids
        assert proposal["bid"] > 0


def test_proposals_have_varied_positive_integer_duration_terms():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)

    durations = [proposal["proposedDurationDays"] for proposal in proposals]

    assert all(isinstance(duration, int) and duration >= 1 for duration in durations)
    assert len(set(durations)) >= 5
