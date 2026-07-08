import networkx as nx
from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.collusion_rings import build_collusion_rings


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
