from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals
from generator.engagements import generate_engagements
from generator.outcomes import generate_outcomes
from generator.payments import generate_payments


def test_payments_only_generated_for_freelancers_with_concluded_paid_engagements():
    config = GeneratorConfig(seed=42, num_profiles=300)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    payments = generate_payments(config, profiles, engagements, outcomes)

    freelancer_ids = {p["_localId"] for p in profiles if p["role"] == "freelancer"}
    assert len(payments) > 0
    assert all(p["freelancerProfileLocalId"] in freelancer_ids for p in payments)
    assert all(p["amount"] > 0 for p in payments)
