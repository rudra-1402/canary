import random
import networkx as nx
from generator.config import GeneratorConfig


def build_collusion_rings(config: GeneratorConfig, profiles: list[dict]) -> list[dict]:
    rng = random.Random(config.seed + 4)
    colluders = [p["_localId"] for p in profiles if p["trueArchetype"] == "colluder"]
    rng.shuffle(colluders)

    rings = []
    i = 0
    ring_index = 0
    while i + 1 < len(colluders):
        ring_size = min(rng.randint(2, 4), len(colluders) - i)
        members = colluders[i : i + ring_size]
        i += ring_size

        graph = nx.DiGraph()
        graph.add_nodes_from(members)
        for member in members:
            for other in members:
                if member != other:
                    graph.add_edge(member, other, weight=1)

        rings.append(
            {
                "_localId": f"ring-{ring_index}",
                "memberLocalIds": members,
                "graph": graph,
                "severity": rng.uniform(0.6, 1.0),
            }
        )
        ring_index += 1

    return rings
