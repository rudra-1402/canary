"""Unit tests for the measurement primitives, on hand-built data with a known answer.

Deliberately synthetic and legible: each case states the answer in its own construction,
so the test can be checked by reading it rather than by trusting the statistics. These
guard the instrument. tests/test_generator_signal.py is the gate that points the
instrument at the real generator output.
"""

from quality.signal_audit import (
    conditional_signal,
    label_composition,
    plausibility,
    separation,
)


def test_a_dead_feature_reports_no_separation():
    """Every archetype identical -> the feature cannot carry party information."""
    result = separation({"reliable": [0.5] * 50, "risky": [0.5] * 50, "bad-actor": [0.5] * 50})
    assert result["separation"] == 0.0


def test_a_near_constant_feature_reports_no_separation():
    """The real shape of the on_time_rate defect: almost all zeros, a few stray ones."""
    result = separation(
        {
            "reliable": [0.0] * 96 + [1.0] * 4,
            "risky": [0.0] * 97 + [1.0] * 3,
            "bad-actor": [0.0] * 94 + [1.0] * 6,
        }
    )
    assert result["separation"] < 0.15, result


def test_a_live_feature_reports_strong_separation():
    """The shape of ghost_rate: means well apart relative to the spread."""
    result = separation(
        {
            "reliable": [0.10, 0.12, 0.08, 0.11] * 25,
            "risky": [0.25, 0.27, 0.23, 0.26] * 25,
            "bad-actor": [0.50, 0.52, 0.48, 0.51] * 25,
        },
        higher_is_better=False,  # ghost_rate: higher is worse
    )
    assert result["separation"] > 1.0, result
    assert result["correctly_ordered"] is True


def test_separation_flags_a_feature_that_points_the_wrong_way():
    """Bad actors scoring BETTER than reliable parties -- on_time_rate's actual shape.

    The magnitude is healthy and the ordering is backwards, so a size-only check calls
    this feature fine. Only the declared direction catches it.
    """
    values = {
        "reliable": [0.01] * 50,
        "risky": [0.02] * 50,
        "bad-actor": [0.30] * 50,
    }
    result = separation(values, higher_is_better=True)  # on-time: higher should be better
    assert result["separation"] > 0.5, "magnitude alone looks healthy"
    assert result["correctly_ordered"] is False, "but it points the wrong way"

    # Same numbers, no declared direction -> inversion is undetectable. This is the state
    # every check in the project was in before this module existed.
    assert separation(values)["correctly_ordered"] is None


def test_conditional_signal_unmasks_a_field_that_is_a_proxy():
    """paidInFull's exact shape: discriminative only because ghosting leaks through it.

    Every ghosted row is unpaid, so marginally the archetypes differ. Conditioned on
    not-ghosted, payment is the same coin flip for everyone.
    """
    rows = []
    for archetype, ghost_count in [("reliable", 1), ("risky", 5), ("bad-actor", 12)]:
        # Ghosted rows: unpaid by construction, and their COUNT differs by archetype --
        # which is the only reason payment looks discriminative marginally.
        for _ in range(ghost_count):
            rows.append({"archetype": archetype, "ghosted": True, "paid": 0.0})
        # Non-ghosted rows: an identical 19-in-20 payment rate for every archetype.
        for i in range(20):
            rows.append({"archetype": archetype, "ghosted": False, "paid": 0.0 if i == 19 else 1.0})

    marginal = separation(
        {a: [r["paid"] for r in rows if r["archetype"] == a] for a in ("reliable", "risky", "bad-actor")}
    )
    conditioned = conditional_signal(rows, field="paid", condition="ghosted", archetype_key="archetype")

    assert marginal["separation"] > 0.5, "marginally it should look discriminative"
    assert conditioned["separation"] == 0.0, "conditioned it should be revealed as a proxy"


def test_conditional_signal_keeps_a_genuinely_independent_field():
    """scope_creep's shape: branches on party traits, so it survives conditioning."""
    rows = []
    for archetype, creep_in_20 in [("reliable", 2), ("risky", 5), ("bad-actor", 6)]:
        for i in range(20):
            rows.append({"archetype": archetype, "ghosted": False, "creep": 1.0 if i < creep_in_20 else 0.0})
    result = conditional_signal(rows, field="creep", condition="ghosted", archetype_key="archetype")
    # Per-outcome binary rows carry a large pooled sd, so separation reads lower here than
    # the same concept measured over per-profile rates (0.87 in the live data). The point
    # of the assertion is that it survives conditioning at all, unlike the proxy above.
    assert result["separation"] > 0.4, result


def test_plausibility_rejects_the_observed_lateness_rate():
    assert plausibility(0.987, low=0.05, high=0.60)["ok"] is False
    assert plausibility(0.30, low=0.05, high=0.60)["ok"] is True


def test_label_composition_flags_dead_terms_and_unused_strong_features():
    """Both directions of the real defect, in one assertion."""
    signals = {
        "paid_in_full_rate": 1.35,
        "on_time_rate": 0.04,
        "ghost_rate": 1.50,
        "scope_creep_rate": 0.87,
        "avg_days_late": 1.89,
    }
    used = {"paid_in_full_rate", "on_time_rate", "ghost_rate", "scope_creep_rate"}
    result = label_composition(signals, used)
    assert result["dead_terms"] == ["on_time_rate"]
    assert result["unused_strong_features"] == ["avg_days_late"]
