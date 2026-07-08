from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals
from generator.engagements import generate_engagements
from generator.outcomes import generate_outcomes
from generator.collusion_rings import build_collusion_rings
from generator.reviews import generate_reviews
from generator.manifest import build_manifest


def test_manifest_records_every_profile_archetype():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    manifest = build_manifest(
        config=config, profiles=profiles, jobposts=[], engagements=[], outcomes=[], reviews=[], rings=[]
    )
    assert len(manifest["profiles"]) == 200
    for record in manifest["profiles"]:
        assert "trueArchetype" in record
        assert "isColluder" in record
        assert "isBadActor" in record


def test_manifest_records_the_full_trait_trajectory_per_profile():
    config = GeneratorConfig(seed=42, num_profiles=50, timeline_months=18)
    _, profiles = generate_identities_and_profiles(config)
    manifest = build_manifest(
        config=config, profiles=profiles, jobposts=[], engagements=[], outcomes=[], reviews=[], rings=[]
    )
    for record in manifest["profiles"]:
        assert len(record["traitTrajectory"]) == 19


def test_manifest_records_rings_and_bad_terms_engagements():
    config = GeneratorConfig(seed=42, num_profiles=300)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    rings = build_collusion_rings(config, profiles)

    manifest = build_manifest(
        config=config, profiles=profiles, jobposts=jobposts, engagements=engagements,
        outcomes=[], reviews=[], rings=rings,
    )
    assert len(manifest["rings"]) == len(rings)
    assert any(e["badTerms"] for e in manifest["engagements"])


def test_manifest_records_which_reviews_were_planted():
    config = GeneratorConfig(seed=42, num_profiles=500)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    rings = build_collusion_rings(config, profiles)
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)

    manifest = build_manifest(
        config=config, profiles=profiles, jobposts=jobposts, engagements=engagements,
        outcomes=outcomes, reviews=reviews, rings=rings,
    )
    assert len(manifest["reviews"]) == len(reviews)
    planted_collusion = [r for r in manifest["reviews"] if r["isPlantedCollusion"]]
    assert planted_collusion, "expected at least one planted-collusion review in this seed"
    for record in manifest["reviews"]:
        assert "reviewLocalId" in record
        assert "isPlantedCollusion" in record
        assert "isPlantedSabotage" in record
