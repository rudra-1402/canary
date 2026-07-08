from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals
from generator.engagements import generate_engagements
from generator.outcomes import generate_outcomes
from generator.collusion_rings import build_collusion_rings
from generator.manifest import build_manifest


def test_manifest_records_every_profile_archetype():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    manifest = build_manifest(config, profiles, [], [], [], [], [])
    assert len(manifest["profiles"]) == 200
    for record in manifest["profiles"]:
        assert "trueArchetype" in record
        assert "isColluder" in record
        assert "isBadActor" in record


def test_manifest_records_the_full_trait_trajectory_per_profile():
    config = GeneratorConfig(seed=42, num_profiles=50, timeline_months=18)
    _, profiles = generate_identities_and_profiles(config)
    manifest = build_manifest(config, profiles, [], [], [], [], [])
    for record in manifest["profiles"]:
        assert len(record["traitTrajectory"]) == 19


def test_manifest_records_rings_and_bad_terms_engagements():
    config = GeneratorConfig(seed=42, num_profiles=300)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    rings = build_collusion_rings(config, profiles)

    manifest = build_manifest(config, profiles, jobposts, engagements, [], rings, [])
    assert len(manifest["rings"]) == len(rings)
    assert any(e["badTerms"] for e in manifest["engagements"])
