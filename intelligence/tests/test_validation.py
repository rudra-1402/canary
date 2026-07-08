from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals
from generator.engagements import generate_engagements
from generator.outcomes import generate_outcomes
from generator.reviews import generate_reviews
from generator.collusion_rings import build_collusion_rings
from generator.manifest import build_manifest
from generator.validation import validate_dataset


def _build_full_dataset(num_profiles=400):
    config = GeneratorConfig(seed=42, num_profiles=num_profiles)
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
    return config, profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest


def _validate(profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest):
    return validate_dataset(
        profiles=profiles, jobposts=jobposts, proposals=proposals, engagements=engagements,
        outcomes=outcomes, reviews=reviews, rings=rings, manifest=manifest,
    )


def test_referential_integrity_has_no_orphans():
    _, profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest = _build_full_dataset()
    report = _validate(profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest)
    assert report["referentialIntegrity"]["orphanProposals"] == 0
    assert report["referentialIntegrity"]["orphanReviews"] == 0
    assert report["referentialIntegrity"]["orphanOutcomes"] == 0


def test_ring_signature_check_passes_for_every_ring():
    _, profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest = _build_full_dataset()
    report = _validate(profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest)
    assert report["ringSignatureCheck"]["ringsWithoutReciprocity"] == 0


def test_manifest_reconciles_with_counts():
    _, profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest = _build_full_dataset()
    report = _validate(profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest)
    assert report["manifestReconciliation"]["profileCountMatches"] is True
    assert report["manifestReconciliation"]["ringCountMatches"] is True
