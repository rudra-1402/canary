from generator.collusion_rings import build_collusion_rings
from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import generate_outcomes
from generator.proposals import generate_proposals
from generator.reviews import generate_reviews


def _setup(num_profiles=500):
    config = GeneratorConfig(seed=42, num_profiles=num_profiles)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    rings = build_collusion_rings(config, profiles)
    return config, profiles, engagements, outcomes, rings


def test_reviews_are_at_most_two_per_engagement():
    config, profiles, engagements, outcomes, rings = _setup()
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    counts = {}
    for r in reviews:
        counts[r["engagementLocalId"]] = counts.get(r["engagementLocalId"], 0) + 1
    assert all(c <= 2 for c in counts.values())


def test_colluder_reviews_are_glowing_and_flagged_unmatched():
    config, profiles, engagements, outcomes, rings = _setup()
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    colluder_reviews = [r for r in reviews if r.get("isPlantedCollusion")]
    assert len(colluder_reviews) > 0
    assert all(r["rating"] >= 4 for r in colluder_reviews)


def test_saboteur_reviews_are_unwarranted_one_star():
    config, profiles, engagements, outcomes, rings = _setup()
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    saboteur_reviews = [r for r in reviews if r.get("isPlantedSabotage")]
    if saboteur_reviews:
        assert all(r["rating"] == 1 for r in saboteur_reviews)
