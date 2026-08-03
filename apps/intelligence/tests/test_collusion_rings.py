import networkx as nx

from generator.collusion_rings import build_collusion_rings
from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles


def test_each_ring_has_at_least_two_members_and_reciprocal_edges():
    config = GeneratorConfig(seed=42, num_profiles=500)
    _, profiles = generate_identities_and_profiles(config)
    rings = build_collusion_rings(config, profiles)

    assert len(rings) > 0
    for ring in rings:
        assert len(ring["memberLocalIds"]) >= 2
        graph = ring["graph"]
        assert isinstance(graph, nx.DiGraph)
        for member in ring["memberLocalIds"]:
            others = [m for m in ring["memberLocalIds"] if m != member]
            assert any(graph.has_edge(member, other) for other in others)


def test_rings_are_built_only_from_colluder_archetype_profiles():
    config = GeneratorConfig(seed=42, num_profiles=500)
    _, profiles = generate_identities_and_profiles(config)
    rings = build_collusion_rings(config, profiles)
    colluder_ids = {p["_localId"] for p in profiles if p["trueArchetype"] == "colluder"}
    for ring in rings:
        assert set(ring["memberLocalIds"]).issubset(colluder_ids)


def test_every_ring_has_at_least_one_client_and_one_freelancer():
    # An all-freelancer or all-client ring cannot produce a jobpost<->proposal
    # engagement between its own members -- it is structurally inert. Every
    # ring must be role-mixed or it cannot ever transact internally.
    config = GeneratorConfig(seed=42, num_profiles=5000)
    _, profiles = generate_identities_and_profiles(config)
    rings = build_collusion_rings(config, profiles)
    role_by_id = {p["_localId"]: p["role"] for p in profiles}

    assert len(rings) > 0
    for ring in rings:
        roles = {role_by_id[member] for member in ring["memberLocalIds"]}
        assert "client" in roles, f"ring {ring['_localId']} has no client member"
        assert "freelancer" in roles, f"ring {ring['_localId']} has no freelancer member"


def test_role_mixed_rings_still_cover_every_colluder_across_seeds():
    for seed in range(5):
        config = GeneratorConfig(seed=seed, num_profiles=5000)
        _, profiles = generate_identities_and_profiles(config)
        rings = build_collusion_rings(config, profiles)
        colluder_ids = {p["_localId"] for p in profiles if p["trueArchetype"] == "colluder"}
        ring_member_ids = {m for ring in rings for m in ring["memberLocalIds"]}
        assert ring_member_ids == colluder_ids
