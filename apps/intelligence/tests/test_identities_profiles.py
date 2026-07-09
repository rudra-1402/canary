from datetime import datetime

from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles


def test_generates_one_profile_per_identity_with_archetype():
    config = GeneratorConfig(seed=42, num_profiles=50)
    identities, profiles = generate_identities_and_profiles(config)
    assert len(profiles) == 50
    assert len(identities) <= 50
    for profile in profiles:
        assert profile["role"] in ("freelancer", "client")
        assert profile["trueArchetype"] in (
            "reliable",
            "risky",
            "bad-actor",
            "cold-start",
            "colluder",
            "saboteur",
        )
        assert profile["origin"] in ("user-registered", "synthetic-seeded")


def test_synthetic_seeded_profiles_are_always_discoverable():
    config = GeneratorConfig(seed=42, num_profiles=50)
    _, profiles = generate_identities_and_profiles(config)
    for profile in profiles:
        if profile["origin"] == "synthetic-seeded":
            assert profile["discoverable"] is True


def test_verification_status_correlates_with_bad_actor_archetype():
    config = GeneratorConfig(seed=42, num_profiles=500)
    _, profiles = generate_identities_and_profiles(config)
    bad_actors = [p for p in profiles if p["trueArchetype"] == "bad-actor"]
    reliable = [p for p in profiles if p["trueArchetype"] == "reliable"]
    bad_actor_verified = sum(p["verificationStatus"] == "id-verified" for p in bad_actors)
    reliable_verified = sum(p["verificationStatus"] == "id-verified" for p in reliable)
    bad_actor_verified_rate = bad_actor_verified / len(bad_actors)
    reliable_verified_rate = reliable_verified / len(reliable)
    assert bad_actor_verified_rate < reliable_verified_rate


def test_profiles_carry_a_trait_trajectory_and_join_date():
    config = GeneratorConfig(seed=42, num_profiles=100, timeline_months=18)
    _, profiles = generate_identities_and_profiles(config)
    now = datetime.utcnow()
    for profile in profiles:
        assert len(profile["_traitTrajectory"]) == 19
        assert isinstance(profile["createdAt"], datetime)
        assert profile["createdAt"] <= now


def test_cold_start_profiles_joined_recently():
    config = GeneratorConfig(seed=42, num_profiles=500, timeline_months=18)
    _, profiles = generate_identities_and_profiles(config)
    now = datetime.utcnow()
    cold_start = [p for p in profiles if p["trueArchetype"] == "cold-start"]
    assert cold_start, "expected at least one cold-start profile in this seed"
    for profile in cold_start:
        months_ago = (now - profile["createdAt"]).days / 30
        assert months_ago <= config.cold_start_recent_months + 1


def test_identities_carry_a_created_at_matching_their_profile():
    config = GeneratorConfig(seed=42, num_profiles=100, timeline_months=18)
    identities, profiles = generate_identities_and_profiles(config)
    identities_by_local_id = {i["_localId"]: i for i in identities}
    now = datetime.utcnow()
    for profile in profiles:
        identity = identities_by_local_id[profile["identityLocalId"]]
        assert isinstance(identity["createdAt"], datetime)
        assert identity["createdAt"] <= now
        assert identity["createdAt"] == profile["createdAt"]
