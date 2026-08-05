import random

import networkx as nx

from generator.config import GeneratorConfig


def _ring_from_members(ring_index: int, members: list[str], rng: random.Random) -> dict:
    graph = nx.DiGraph()
    graph.add_nodes_from(members)
    for member in members:
        for other in members:
            if member != other:
                graph.add_edge(member, other, weight=1)
    return {
        "_localId": f"ring-{ring_index}",
        "memberLocalIds": members,
        "graph": graph,
        "severity": rng.uniform(0.6, 1.0),
    }


def build_collusion_rings(config: GeneratorConfig, profiles: list[dict]) -> list[dict]:
    """Group planted colluders into role-mixed rings.

    A ring made up of only clients or only freelancers cannot ever produce a
    jobpost -> proposal -> engagement between its own members: there is no
    counterparty role inside the ring to transact with. Every ring must
    therefore contain at least one client and at least one freelancer, so
    downstream ring-internal engagement forcing always has a real pair to
    work with. No colluder is dropped: whichever role has a surplus after
    every base ring gets one of each is folded into the existing rings
    round-robin, rather than left ungrouped.
    """
    rng = random.Random(config.seed + 4)
    colluders_by_id = {p["_localId"]: p for p in profiles if p["trueArchetype"] == "colluder"}
    freelancers = [pid for pid, p in colluders_by_id.items() if p["role"] == "freelancer"]
    clients = [pid for pid, p in colluders_by_id.items() if p["role"] == "client"]
    rng.shuffle(freelancers)
    rng.shuffle(clients)

    if not freelancers or not clients:
        # No role-mixed ring is possible at all (one role is entirely absent
        # among planted colluders) -- extremely unlikely at any realistic
        # colluder_rate, but there is nothing sensible to build here.
        return []

    rings = []
    f_i = c_i = 0
    while f_i < len(freelancers) and c_i < len(clients):
        # Guarantee one of each role first, then top up to the target ring
        # size from whichever role still has budget on both sides.
        members = [freelancers[f_i], clients[c_i]]
        f_i += 1
        c_i += 1
        target_size = rng.randint(2, 4)
        while len(members) < target_size and (f_i < len(freelancers) or c_i < len(clients)):
            take_freelancer = f_i < len(freelancers) and (c_i >= len(clients) or rng.random() < 0.5)
            if take_freelancer:
                members.append(freelancers[f_i])
                f_i += 1
            else:
                members.append(clients[c_i])
                c_i += 1
        rings.append(_ring_from_members(len(rings), members, rng))

    # Whichever role ran out first leaves a surplus on the other side (e.g.
    # more freelancer-colluders than client-colluders). Every base ring
    # above is already role-mixed, so folding the surplus in round-robin
    # keeps every ring mixed while still covering every planted colluder.
    leftover = freelancers[f_i:] + clients[c_i:]
    for offset, member in enumerate(leftover):
        ring = rings[offset % len(rings)]
        ring["memberLocalIds"].append(member)
        ring["graph"].add_node(member)
        for other in ring["memberLocalIds"]:
            if other != member:
                ring["graph"].add_edge(member, other, weight=1)
                ring["graph"].add_edge(other, member, weight=1)

    return rings
