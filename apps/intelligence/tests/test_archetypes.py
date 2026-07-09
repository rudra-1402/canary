from generator.archetypes import (
    assign_archetypes,
    assign_special_roles,
    assign_traits,
    derive_archetype,
    simulate_trait_drift,
)
from generator.config import GeneratorConfig


def test_assign_archetypes_respects_mix_within_tolerance():
    config = GeneratorConfig(seed=42, num_profiles=1000)
    archetypes = assign_archetypes(config)
    assert len(archetypes) == 1000
    counts = {}
    for a in archetypes:
        counts[a] = counts.get(a, 0) + 1
    assert abs(counts.get("reliable", 0) / 1000 - 0.65) < 0.08
    assert abs(counts.get("bad-actor", 0) / 1000 - 0.08) < 0.05
    assert abs(counts.get("colluder", 0) / 1000 - 0.02) < 0.02


def test_assign_archetypes_is_deterministic_for_same_seed():
    config = GeneratorConfig(seed=7, num_profiles=200)
    first = assign_archetypes(config)
    second = assign_archetypes(config)
    assert first == second


def test_traits_are_continuous_and_bounded():
    config = GeneratorConfig(seed=42, num_profiles=200)
    traits = assign_traits(config)
    assert len(traits) == 200
    for t in traits:
        assert 0.0 <= t["reliability"] <= 1.0
        assert 0.0 <= t["responsiveness"] <= 1.0


def test_reliability_and_responsiveness_are_correlated():
    config = GeneratorConfig(seed=42, num_profiles=500)
    traits = assign_traits(config)
    reliabilities = [t["reliability"] for t in traits]
    responsivenesses = [t["responsiveness"] for t in traits]
    mean_r = sum(reliabilities) / len(reliabilities)
    mean_s = sum(responsivenesses) / len(responsivenesses)
    covariance = sum(
        (r - mean_r) * (s - mean_s) for r, s in zip(reliabilities, responsivenesses, strict=True)
    ) / len(reliabilities)
    assert covariance > 0, "traits should be positively correlated, not independent noise"


def test_trait_drift_produces_one_snapshot_per_month_plus_start():
    config = GeneratorConfig(seed=42, num_profiles=50, timeline_months=18)
    initial = assign_traits(config)
    trajectories = simulate_trait_drift(config, initial)
    assert len(trajectories) == 50
    for trajectory in trajectories:
        assert len(trajectory) == 19  # month 0 (initial) through month 18
        for snapshot in trajectory:
            assert 0.0 <= snapshot["reliability"] <= 1.0
            assert 0.0 <= snapshot["responsiveness"] <= 1.0


def test_trait_drift_is_deterministic_for_same_seed():
    config = GeneratorConfig(seed=7, num_profiles=50, timeline_months=18)
    initial = assign_traits(config)
    first = simulate_trait_drift(config, initial)
    second = simulate_trait_drift(config, initial)
    assert first == second


def test_derive_archetype_is_monotonic_in_combined_trait_value():
    config = GeneratorConfig()
    assert derive_archetype({"reliability": 0.9, "responsiveness": 0.9}, config) == "reliable"
    assert derive_archetype({"reliability": 0.5, "responsiveness": 0.5}, config) == "risky"
    assert derive_archetype({"reliability": 0.1, "responsiveness": 0.1}, config) == "bad-actor"


def test_special_roles_respect_configured_rates_and_are_mutually_exclusive():
    config = GeneratorConfig(seed=42, num_profiles=2000)
    roles = assign_special_roles(config)
    assert len(roles) == 2000
    colluder_count = sum(1 for r in roles if r == "colluder")
    saboteur_count = sum(1 for r in roles if r == "saboteur")
    assert abs(colluder_count / 2000 - config.colluder_rate) < 0.015
    assert abs(saboteur_count / 2000 - config.saboteur_rate) < 0.01
    assert all(r in (None, "colluder", "saboteur") for r in roles)
