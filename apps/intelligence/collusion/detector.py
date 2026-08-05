"""Ranked collusion-risk scoring and candidate-ring extraction.

Combines collusion/signals.py's per-profile signals with a clique-density term
read off the suspect graph (collusion/graph.py). Nothing here ever reads a
planted-ground-truth field; ground truth is loaded separately, after scoring, in
collusion/evaluate.py.
"""

from __future__ import annotations

import networkx as nx

from collusion.graph import build_pair_stats, build_suspect_graph
from collusion.signals import compute_profile_signals

# Not tuned against ground truth -- fixed weights over four independent structural
# signals (reciprocal 5-star rate, counterparty concentration, outcome-rating
# mismatch, suspect-clique density), each in [0, 1], summing to 1.
SIGNAL_WEIGHTS = {
    "reciprocal_five_star_rate": 0.35,
    "top_partner_share": 0.25,
    "five_star_outcome_mismatch_rate": 0.25,
    "clique_density": 0.15,
}


def _build_artifacts(dataset: dict):
    pair_stats = build_pair_stats(dataset["reviews"])
    suspect_graph = build_suspect_graph(pair_stats)
    profile_signals = compute_profile_signals(dataset, pair_stats)
    return pair_stats, suspect_graph, profile_signals


def _score_from_signals(profile_signals: dict, suspect_graph: nx.Graph) -> list[dict]:
    clustering = nx.clustering(suspect_graph) if suspect_graph.number_of_nodes() else {}

    scored = []
    for profile_id, signals in profile_signals.items():
        clique_density = clustering.get(profile_id, 0.0)
        risk_score = (
            SIGNAL_WEIGHTS["reciprocal_five_star_rate"] * signals["reciprocal_five_star_rate"]
            + SIGNAL_WEIGHTS["top_partner_share"] * signals["top_partner_share"]
            + SIGNAL_WEIGHTS["five_star_outcome_mismatch_rate"] * signals["five_star_outcome_mismatch_rate"]
            + SIGNAL_WEIGHTS["clique_density"] * clique_density
        )
        scored.append(
            {
                "profile_id": profile_id,
                "risk_score": risk_score,
                # Non-label-tuned decision rule: any reciprocal 5-star engagement at
                # all is the flag. Evaluation grades this rule; the ranking itself
                # (risk_score) is the actual detector output.
                "flagged": signals["reciprocal_five_star_count"] > 0,
                "signals": {**signals, "clique_density": clique_density},
            }
        )
    scored.sort(key=lambda row: row["risk_score"], reverse=True)
    return scored


def _rings_from_graph(suspect_graph: nx.Graph) -> list[dict]:
    rings = []
    for index, component in enumerate(nx.connected_components(suspect_graph)):
        if len(component) < 2:
            continue
        subgraph = suspect_graph.subgraph(component)
        rings.append(
            {
                "ring_id": f"candidate-ring-{index}",
                "member_profile_ids": sorted(component, key=str),
                "size": len(component),
                "density": nx.density(subgraph),
            }
        )
    return rings


def score_profiles(dataset: dict) -> list[dict]:
    """Rank every profile that appears in any review pair by collusion risk."""
    _, suspect_graph, profile_signals = _build_artifacts(dataset)
    return _score_from_signals(profile_signals, suspect_graph)


def detect_candidate_rings(dataset: dict) -> list[dict]:
    """Connected components of the suspect graph, size >= 2 -- candidate rings."""
    _, suspect_graph, _ = _build_artifacts(dataset)
    return _rings_from_graph(suspect_graph)


def run_detector(dataset: dict) -> dict:
    """Score and detect rings from one shared set of artifacts (avoids recompute)."""
    _, suspect_graph, profile_signals = _build_artifacts(dataset)
    return {
        "scored": _score_from_signals(profile_signals, suspect_graph),
        "rings": _rings_from_graph(suspect_graph),
    }
