"""Statistical acceptance measurements for the generator's output.

The generator exists to be training data, so its correctness criterion is statistical.
Every check that preceded this module -- validate_dataset, the pytest suite,
seedConformance, seedInvariants -- asserts structure: field present, pointer resolves,
type correct, ordering directionally right. None could observe a feature collapsing to a
constant, or a field turning out to be another field in disguise. Four defects reached
production through that gap.

These are measurements, not assertions. tests/test_signal_audit.py turns them into a gate;
keeping the two apart means the same functions can be run ad hoc while tuning the
generator, which is when the numbers are actually needed.

Vocabulary: "separation" is the spread of a feature's per-archetype means expressed in
population standard deviations -- a scale-free read of how much the ground truth is
recoverable from the emitted data.
"""

from collections import defaultdict

import numpy as np

# Only the organic reliability classes. colluder/saboteur carry deliberately elevated
# surface traits (they exist to be caught by Slice 2, not ranked by Slice 1), so including
# them would make a healthy feature look inconsistent.
ORGANIC_ARCHETYPES = ("reliable", "risky", "bad-actor")

# Ordered worst -> best, for checking a feature points the way its name claims.
SEVERITY_ORDER = ("bad-actor", "risky", "reliable")


def separation(values_by_archetype: dict[str, list[float]], higher_is_better: bool | None = None) -> dict:
    """Spread of per-archetype means, in population standard deviations.

    A feature that cannot separate the planted classes carries no information about the
    party no matter how it is weighted downstream -- which is the failure that a
    comparative assertion (`bad > good`) cannot detect, since it holds at 0.9 vs 0.1 and
    at 0.0001 vs 0.00001 alike.

    `higher_is_better` states which way the feature is supposed to point, and is required
    to detect INVERSION. Without it the best that can be said is "the means differ",
    which a backwards feature satisfies just as well as a correct one -- and on_time_rate
    is backwards today (bad-actor 0.058 > reliable 0.013), so magnitude alone would
    report it healthy. `None` means the direction is genuinely undefined; use it sparingly.
    """
    present = [a for a in ORGANIC_ARCHETYPES if values_by_archetype.get(a)]
    if len(present) < 2:
        return {"separation": 0.0, "means": {}, "sd": 0.0, "n": 0, "correctly_ordered": None}

    means = {a: float(np.mean(values_by_archetype[a])) for a in present}
    pooled = np.array([v for a in present for v in values_by_archetype[a]], dtype=float)
    sd = float(pooled.std())
    spread = max(means.values()) - min(means.values())

    # SEVERITY_ORDER runs worst -> best, so a feature where higher means better must be
    # non-decreasing across it, and one where higher means worse must be non-increasing.
    correctly_ordered = None
    if higher_is_better is not None:
        ordered = [means[a] for a in SEVERITY_ORDER if a in means]
        pairs = list(zip(ordered, ordered[1:], strict=False))
        correctly_ordered = (
            all(x <= y for x, y in pairs) if higher_is_better else all(x >= y for x, y in pairs)
        )

    return {
        "separation": float(spread / sd) if sd > 1e-9 else 0.0,
        "means": means,
        "sd": sd,
        "n": int(pooled.size),
        "correctly_ordered": correctly_ordered,
    }


def conditional_signal(rows: list[dict], field: str, condition: str, archetype_key: str) -> dict:
    """Does `field` still separate archetypes once `condition` is held out?

    The check no marginal measurement can make. `paidInFull` looked strongly
    discriminative (0.826 reliable vs 0.480 bad-actor) and was a flat 95% coin flip once
    ghosting was conditioned away -- every bit of its apparent power was another field
    leaking through a conjunction. A label term that is a proxy for a term already in the
    label inflates that concept's weight silently.
    """
    kept = defaultdict(list)
    for row in rows:
        if row.get(condition):
            continue
        archetype = row.get(archetype_key)
        if archetype in ORGANIC_ARCHETYPES:
            kept[archetype].append(float(row[field]))
    return separation(kept)


def plausibility(rate: float, low: float, high: float) -> dict:
    """A rate the product reasons about, against a range a real marketplace could show.

    Deliberately crude. 98.7% of deliveries being late survived every review for weeks
    because nothing ever asked whether the number was believable -- a bound this blunt
    would have failed it on the first seed.
    """
    return {"value": float(rate), "low": low, "high": high, "ok": low <= rate <= high}


def label_composition(term_signals: dict[str, float], used_terms: set[str]) -> dict:
    """Flags label terms carrying no signal, and strong features left out of the label.

    Both directions matter and only one is intuitive. `on_time_rate` held 30% of the
    weight while being dead; `avg_days_late` was the strongest measured feature in the
    dataset and was in no term at all. Nothing in the pipeline could report either fact.
    """
    dead = sorted(t for t in used_terms if term_signals.get(t, 0.0) < 0.15)
    unused_strong = sorted(t for t, s in term_signals.items() if t not in used_terms and s >= 0.5)
    return {"dead_terms": dead, "unused_strong_features": unused_strong}
