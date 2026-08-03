"""Pairwise review aggregation and the suspect-edge graph built from it.

Everything here reads only ``authorProfileId``, ``subjectProfileId``, ``rating``
and ``engagementId`` off Review documents -- observable marketplace data. No
planted-ground-truth field is read or referenced anywhere in this module.
"""

from __future__ import annotations

from collections import defaultdict

import networkx as nx


def _pair_key(profile_a, profile_b) -> frozenset:
    return frozenset((profile_a, profile_b))


def build_pair_stats(reviews: list[dict]) -> dict[frozenset, dict]:
    """Aggregate reviews between each unordered profile pair.

    For every pair, tracks every engagement either side reviewed the other on, and
    the subset of those engagements where *both* sides reviewed each other with a
    5-star rating in the same engagement ("reciprocal five-star") -- the pattern the
    generator plants for a real ring-internal transaction (generator/reviews.py
    forces rating 5 on both authored reviews of an engagement between two ring
    members).
    """
    pair_engagement_ids: dict[frozenset, set] = defaultdict(set)
    ratings_by_engagement_pair: dict[tuple, dict] = {}

    for review in reviews:
        author = review["authorProfileId"]
        subject = review["subjectProfileId"]
        if author == subject:
            continue
        pair = _pair_key(author, subject)
        engagement_id = review["engagementId"]
        pair_engagement_ids[pair].add(engagement_id)
        ratings_by_engagement_pair.setdefault((engagement_id, pair), {})[author] = review["rating"]

    stats = {
        pair: {"engagement_ids": engagement_ids, "reciprocal_five_star_engagement_ids": set()}
        for pair, engagement_ids in pair_engagement_ids.items()
    }
    for (engagement_id, pair), ratings_by_author in ratings_by_engagement_pair.items():
        if len(ratings_by_author) == 2 and all(rating == 5 for rating in ratings_by_author.values()):
            stats[pair]["reciprocal_five_star_engagement_ids"].add(engagement_id)
    return stats


def build_suspect_graph(pair_stats: dict[frozenset, dict]) -> nx.Graph:
    """Undirected graph over profiles; an edge marks a pair with >=1 reciprocal
    five-star engagement. A planted ring is a complete subgraph among its members
    on the generator's internal collusion graph, but only the subset of ring pairs
    that actually transacted in the seeded marketplace can appear here -- ring
    membership that never produced a shared engagement leaves no edge at all.
    """
    graph = nx.Graph()
    for pair, stats in pair_stats.items():
        weight = len(stats["reciprocal_five_star_engagement_ids"])
        if weight:
            profile_a, profile_b = tuple(pair)
            graph.add_edge(profile_a, profile_b, weight=weight)
    return graph
