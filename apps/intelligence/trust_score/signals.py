"""Structured, explainable risk signals derived from the same feature vector that
produced a Trust Score snapshot.

Part B.0: a scored snapshot with zero risk signals makes trustScore.service.js
throw for every real score (`TrustScore signals are unavailable`), so this module
must never return an empty list for a role it supports. The fixed, role-specific
metrics below mirror ROLE_LABEL_TERMS in trust_score.labels -- the reasons shown
are the same conduct terms the model was actually trained on -- and features.py
guarantees each is a real number (never NaN) for the profile's own role once it
clears min_engagements_for_scoring, so none of these can come back empty.
"""

from __future__ import annotations

from quality.gates import PLAUSIBILITY_RANGES

SIGNAL_SOURCE = "structured-data"


def _midpoint(range_key: str) -> float:
    low, high = PLAUSIBILITY_RANGES[range_key]
    return (low + high) / 2


def _signal(name: str, value: float, *, favorable: bool) -> dict:
    return {
        "name": name,
        "value": float(value),
        "direction": "favorable" if favorable else "unfavorable",
        "source": SIGNAL_SOURCE,
    }


def build_risk_signals(features: dict, role: str) -> list[dict]:
    """Return the fixed conduct signals behind one scored snapshot for ``role``.

    Direction is judged against PLAUSIBILITY_RANGES' plausible-range midpoint for
    each rate -- an existing, already-reviewed reference -- rather than a new
    arbitrary threshold.
    """
    if role == "freelancer":
        ghost_rate = features["ghost_rate"]
        on_time_rate = features["on_time_rate"]
        return [
            _signal("ghost-rate", ghost_rate, favorable=ghost_rate <= _midpoint("ghost")),
            _signal("on-time-rate", on_time_rate, favorable=on_time_rate >= _midpoint("on_time")),
        ]
    if role == "client":
        ghost_rate = features["ghost_rate"]
        paid_in_full_rate = features["paid_in_full_rate"]
        scope_creep_rate = features["scope_creep_rate"]
        return [
            _signal("ghost-rate", ghost_rate, favorable=ghost_rate <= _midpoint("ghost")),
            _signal(
                "paid-in-full-rate",
                paid_in_full_rate,
                favorable=paid_in_full_rate >= _midpoint("paid_in_full"),
            ),
            _signal(
                "scope-creep-rate",
                scope_creep_rate,
                favorable=scope_creep_rate <= _midpoint("scope_creep"),
            ),
        ]
    raise ValueError(f"Unsupported role for risk signals: {role!r}")
