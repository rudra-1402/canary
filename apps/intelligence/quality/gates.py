"""Acceptance judgments over :mod:`quality.signal_audit` measurements.

``signal_audit`` measures; this module judges those measurements against the frozen A1
floors.  In particular, ``separation`` means the spread of per-archetype means in
pooled population standard deviations.  It is not Cohen's d.

The plausibility ranges below are product judgments, not estimates sourced from
published marketplace data.  A miss calls for re-examination; it does not by itself
prove the generator is defective.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from math import isnan
from typing import Any

from .signal_audit import ORGANIC_ARCHETYPES

MIN_SCOREABLE_PER_ARCHETYPE = 200
MIN_SEEDS = 5
ARCHETYPE_RECOVERABILITY_FLOOR = 0.5
CONDITIONAL_SEPARATION_FLOOR = 0.3
FEATURE_DEGENERACY_MAX_SHARE = 0.50
LABEL_MIN_DISTINCT_VALUES = 20
LABEL_DEGENERACY_MAX_SHARE = 0.10
LABEL_COMPOSITION_FEATURE_FLOOR = 1.0

PLAUSIBILITY_RANGES = {
    "on_time": (0.55, 0.90),
    "ghost": (0.02, 0.15),
    "paid_in_full": (0.80, 0.98),
    "scope_creep": (0.10, 0.40),
}

# This has to be explicit: a constant per-role discriminator is contract metadata,
# not a behavioural feature which should separate archetypes within that role.
DEFAULT_DISCRIMINATOR_COLUMNS = frozenset({"subject_role"})
GHOST_TERMS = frozenset({"ghost", "ghost_rate"})


class GateStatus(StrEnum):
    """A gate's outcome; not-evaluable evidence is never a pass."""

    PASS = "PASS"
    FAIL = "FAIL"
    NOT_EVALUABLE = "NOT EVALUABLE"


@dataclass(frozen=True)
class GateResult:
    """One judgment, including failing facts and the observed multi-seed ranges."""

    name: str
    status: GateStatus
    failures: Mapping[str, list[str]] = field(default_factory=dict)
    ranges: Mapping[str, tuple[float, float]] = field(default_factory=dict)
    reason: str | None = None


@dataclass(frozen=True)
class CollinearityExemption:
    """A named, advance declaration that an omitted feature has one label-term sibling."""

    feature: str
    sibling: str
    predeclared: bool = True
    role: str | None = None


def _not_evaluable(name: str, reason: str) -> GateResult:
    return GateResult(name=name, status=GateStatus.NOT_EVALUABLE, reason=reason)


def _statistical_precondition(name: str, seeds: Sequence[Mapping[str, Any]]) -> GateResult | None:
    """Require adequate per-role, per-archetype samples across independent seeds."""
    if len(seeds) < MIN_SEEDS:
        return _not_evaluable(name, f"requires at least {MIN_SEEDS} seeds; received {len(seeds)}")

    expected_roles = set(seeds[0].get("roles", {}))
    if not expected_roles:
        return _not_evaluable(name, "seed contains no role measurements")
    for seed in seeds:
        seed_id = str(seed.get("seed", "unknown"))
        roles = seed.get("roles", {})
        if set(roles) != expected_roles:
            return _not_evaluable(name, f"seed {seed_id} does not contain every evaluated role")
        for role, measurement in roles.items():
            counts = measurement.get("scoreable_by_archetype", {})
            underpowered = [
                f"{archetype}={counts.get(archetype, 0)}"
                for archetype in ORGANIC_ARCHETYPES
                if counts.get(archetype, 0) < MIN_SCOREABLE_PER_ARCHETYPE
            ]
            if underpowered:
                return _not_evaluable(
                    name,
                    f"seed {seed_id}, role {role} has fewer than {MIN_SCOREABLE_PER_ARCHETYPE} "
                    f"scoreable profiles ({', '.join(underpowered)})",
                )
    return None


def _add_failure(failures: dict[str, list[str]], key: str, message: str) -> None:
    failures.setdefault(key, []).append(message)


def _range(values: list[float]) -> tuple[float, float]:
    return (min(values), max(values))


def judge_leakage_windows(
    windows_by_profile: Mapping[str, Mapping[str, Sequence[Mapping[str, Any]]]],
    *,
    evaluable: bool = True,
) -> GateResult:
    """Judge row identity and temporal ordering, never field-name overlap.

    The default supports A4 label-builder fixtures.  A1 calls this with
    ``evaluable=False`` because it has no temporal label builder yet.
    """
    if not evaluable:
        return _not_evaluable("leakage", "A4 temporal label builder is not available")

    failures: dict[str, list[str]] = {}
    for profile_id, windows in windows_by_profile.items():
        feature_rows = windows.get("feature_rows", [])
        label_rows = windows.get("label_rows", [])
        if not feature_rows or not label_rows:
            _add_failure(failures, profile_id, "both feature and label event windows must be non-empty")
            continue

        feature_ids = {row["row_id"] for row in feature_rows}
        label_ids = {row["row_id"] for row in label_rows}
        overlap = feature_ids & label_ids
        if overlap:
            _add_failure(failures, profile_id, f"rows feed both windows: {sorted(overlap)}")

        feature_times = [_recorded_at(row) for row in feature_rows]
        label_times = [_recorded_at(row) for row in label_rows]
        if min(label_times) <= max(feature_times):
            _add_failure(
                failures,
                profile_id,
                "every label recordedAt must be strictly later than every feature recordedAt",
            )

    return GateResult(
        name="leakage",
        status=GateStatus.FAIL if failures else GateStatus.PASS,
        failures=failures,
    )


def _recorded_at(row: Mapping[str, Any]) -> datetime:
    recorded_at = row["recordedAt"]
    if not isinstance(recorded_at, datetime):
        raise TypeError("event windows require datetime recordedAt values")
    return recorded_at


def judge_archetype_recoverability(
    seeds: Sequence[Mapping[str, Any]],
    *,
    discriminator_columns: frozenset[str] = DEFAULT_DISCRIMINATOR_COLUMNS,
) -> GateResult:
    """Require every behavioural feature's recorded separation to clear 0.5 per role."""
    precondition = _statistical_precondition("archetype_recoverability", seeds)
    if precondition:
        return precondition

    failures: dict[str, list[str]] = {}
    ranges: dict[str, tuple[float, float]] = {}
    by_feature: dict[tuple[str, str], list[float]] = {}
    for seed in seeds:
        for role, measurement in seed["roles"].items():
            for feature, value in measurement["feature_separations"].items():
                if feature not in discriminator_columns:
                    by_feature.setdefault((role, feature), []).append(float(value))
    for (role, feature), values in by_feature.items():
        key = f"{role}.{feature}"
        ranges[key] = _range(values)
        if min(values) < ARCHETYPE_RECOVERABILITY_FLOOR:
            _add_failure(
                failures,
                feature,
                f"{role} separation range {ranges[key]} is below {ARCHETYPE_RECOVERABILITY_FLOOR}",
            )
    return GateResult(
        name="archetype_recoverability",
        status=GateStatus.FAIL if failures else GateStatus.PASS,
        failures=failures,
        ranges=ranges,
    )


def judge_conditional_independence(seeds: Sequence[Mapping[str, Any]]) -> GateResult:
    """Require non-ghost label terms to retain >=0.3 separation after the prescribed filter.

    Inputs are the ``observed AND NOT ghosted`` conditional measurements from signal_audit.
    Ghost terms are deliberately exempt: after that filter a ghost indicator is identically zero.
    """
    precondition = _statistical_precondition("conditional_independence", seeds)
    if precondition:
        return precondition

    failures: dict[str, list[str]] = {}
    ranges: dict[str, tuple[float, float]] = {}
    by_term: dict[tuple[str, str], list[float]] = {}
    for seed in seeds:
        for role, measurement in seed["roles"].items():
            for term in measurement["label_terms"]:
                if term in GHOST_TERMS:
                    continue
                value = measurement["conditional_term_separations"].get(term)
                if value is None:
                    raise ValueError(f"missing conditional separation for {role} label term {term}")
                by_term.setdefault((role, term), []).append(float(value))
    for (role, term), values in by_term.items():
        key = f"{role}.{term}"
        ranges[key] = _range(values)
        if min(values) < CONDITIONAL_SEPARATION_FLOOR:
            _add_failure(
                failures,
                term,
                f"{role} conditional separation range {ranges[key]} is below {CONDITIONAL_SEPARATION_FLOOR}",
            )
    return GateResult(
        name="conditional_independence",
        status=GateStatus.FAIL if failures else GateStatus.PASS,
        failures=failures,
        ranges=ranges,
    )


def judge_feature_degeneracy(
    seeds: Sequence[Mapping[str, Any]],
    *,
    discriminator_columns: frozenset[str] = DEFAULT_DISCRIMINATOR_COLUMNS,
) -> GateResult:
    """Fail a behavioural feature whose most common scoreable value exceeds 50%."""
    precondition = _statistical_precondition("feature_degeneracy", seeds)
    if precondition:
        return precondition

    failures: dict[str, list[str]] = {}
    ranges: dict[str, tuple[float, float]] = {}
    by_feature: dict[tuple[str, str], list[float]] = {}
    for seed in seeds:
        for role, measurement in seed["roles"].items():
            for feature, values in measurement["feature_values"].items():
                if feature not in discriminator_columns:
                    by_feature.setdefault((role, feature), []).append(_largest_share(values))
    for (role, feature), shares in by_feature.items():
        key = f"{role}.{feature}"
        ranges[key] = _range(shares)
        if max(shares) > FEATURE_DEGENERACY_MAX_SHARE:
            _add_failure(
                failures,
                feature,
                f"{role} largest value share {ranges[key]} exceeds {FEATURE_DEGENERACY_MAX_SHARE}",
            )
    return GateResult(
        name="feature_degeneracy",
        status=GateStatus.FAIL if failures else GateStatus.PASS,
        failures=failures,
        ranges=ranges,
    )


def judge_label_degeneracy(seeds: Sequence[Mapping[str, Any]]) -> GateResult:
    """Require at least 20 label values and a largest atom no greater than 10%."""
    precondition = _statistical_precondition("label_degeneracy", seeds)
    if precondition:
        return precondition

    failures: dict[str, list[str]] = {}
    ranges: dict[str, tuple[float, float]] = {}
    by_role: dict[str, list[tuple[int, float]]] = {}
    for seed in seeds:
        for role, measurement in seed["roles"].items():
            values = _scoreable_values(measurement["label_values"])
            if not values:
                _add_failure(failures, role, "label has no scoreable values")
                continue
            by_role.setdefault(role, []).append((len(set(values)), _largest_share(values)))
    for role, stats in by_role.items():
        distinct = [float(item[0]) for item in stats]
        atoms = [item[1] for item in stats]
        ranges[f"{role}.distinct"] = _range(distinct)
        ranges[f"{role}.largest_atom"] = _range(atoms)
        if min(distinct) < LABEL_MIN_DISTINCT_VALUES:
            _add_failure(
                failures,
                role,
                f"distinct value range {ranges[f'{role}.distinct']} is below {LABEL_MIN_DISTINCT_VALUES}",
            )
        if max(atoms) > LABEL_DEGENERACY_MAX_SHARE:
            _add_failure(
                failures,
                role,
                f"largest atom range {ranges[f'{role}.largest_atom']} exceeds {LABEL_DEGENERACY_MAX_SHARE}",
            )
    return GateResult(
        name="label_degeneracy",
        status=GateStatus.FAIL if failures else GateStatus.PASS,
        failures=failures,
        ranges=ranges,
    )


def _scoreable_values(values: Sequence[Any]) -> list[Any]:
    return [
        value for value in values if value is not None and not (isinstance(value, float) and isnan(value))
    ]


def _largest_share(values: Sequence[Any]) -> float:
    scoreable = _scoreable_values(values)
    if not scoreable:
        return 1.0
    return max(Counter(scoreable).values()) / len(scoreable)


def judge_plausibility(seeds: Sequence[Mapping[str, Any]]) -> GateResult:
    """Judge each fixed product-plausibility range per role over every seed."""
    precondition = _statistical_precondition("plausibility", seeds)
    if precondition:
        return precondition

    failures: dict[str, list[str]] = {}
    ranges: dict[str, tuple[float, float]] = {}
    by_rate: dict[tuple[str, str], list[float]] = {}
    for seed in seeds:
        for role, measurement in seed["roles"].items():
            for rate in PLAUSIBILITY_RANGES:
                value = measurement["rates"].get(rate)
                if value is None:
                    raise ValueError(f"missing {rate} plausibility measurement for role {role}")
                by_rate.setdefault((role, rate), []).append(float(value))
    for (role, rate), values in by_rate.items():
        key = f"{role}.{rate}"
        ranges[key] = _range(values)
        low, high = PLAUSIBILITY_RANGES[rate]
        if min(values) < low or max(values) > high:
            _add_failure(failures, rate, f"{role} rate range {ranges[key]} is outside [{low}, {high}]")
    return GateResult(
        name="plausibility",
        status=GateStatus.FAIL if failures else GateStatus.PASS,
        failures=failures,
        ranges=ranges,
    )


def judge_label_composition(
    seeds: Sequence[Mapping[str, Any]],
    *,
    exemptions: Sequence[CollinearityExemption] = (),
) -> GateResult:
    """Reject dead non-ghost terms and omitted >=1.0 features, with narrow prior exemptions."""
    precondition = _statistical_precondition("label_composition", seeds)
    if precondition:
        return precondition
    _validate_exemptions(exemptions)

    failures: dict[str, list[str]] = {}
    ranges: dict[str, tuple[float, float]] = {}
    term_values: dict[tuple[str, str], list[float]] = {}
    feature_values: dict[tuple[str, str], list[float]] = {}
    used_terms_by_role: dict[str, set[str]] = {}
    for seed in seeds:
        for role, measurement in seed["roles"].items():
            used_terms = set(measurement["label_terms"])
            used_terms_by_role.setdefault(role, used_terms)
            if used_terms_by_role[role] != used_terms:
                raise ValueError(f"label terms changed across seeds for role {role}")
            for term in used_terms - GHOST_TERMS:
                value = measurement["conditional_term_separations"].get(term)
                if value is None:
                    raise ValueError(f"missing conditional separation for {role} label term {term}")
                term_values.setdefault((role, term), []).append(float(value))
            for feature, value in measurement["feature_separations"].items():
                feature_values.setdefault((role, feature), []).append(float(value))

    for (role, term), values in term_values.items():
        key = f"{role}.{term}"
        ranges[key] = _range(values)
        if min(values) < CONDITIONAL_SEPARATION_FLOOR:
            _add_failure(
                failures,
                term,
                f"{role} conditional term separation range {ranges[key]} is below "
                f"{CONDITIONAL_SEPARATION_FLOOR}",
            )
    for (role, feature), values in feature_values.items():
        key = f"{role}.{feature}"
        ranges.setdefault(key, _range(values))
        if min(values) >= LABEL_COMPOSITION_FEATURE_FLOOR and feature not in used_terms_by_role[role]:
            if not _is_predeclared_sibling(feature, role, used_terms_by_role[role], exemptions):
                _add_failure(
                    failures,
                    feature,
                    f"{role} separation range {ranges[key]} is omitted from its label",
                )
    return GateResult(
        name="label_composition",
        status=GateStatus.FAIL if failures else GateStatus.PASS,
        failures=failures,
        ranges=ranges,
    )


def _validate_exemptions(exemptions: Sequence[CollinearityExemption]) -> None:
    seen: set[tuple[str | None, str]] = set()
    for exemption in exemptions:
        if not exemption.predeclared:
            raise ValueError("collinearity exemptions must be predeclared before gate evaluation")
        key = (exemption.role, exemption.feature)
        if key in seen:
            raise ValueError(f"duplicate collinearity exemption for {exemption.feature}")
        seen.add(key)


def _is_predeclared_sibling(
    feature: str,
    role: str,
    used_terms: set[str],
    exemptions: Sequence[CollinearityExemption],
) -> bool:
    return any(
        exemption.feature == feature and exemption.sibling in used_terms and exemption.role in (None, role)
        for exemption in exemptions
    )


def _combine_degeneracy(feature: GateResult, label: GateResult) -> GateResult:
    """Gate 4 has two explicit floors but remains one acceptance gate."""
    if GateStatus.FAIL in (feature.status, label.status):
        status = GateStatus.FAIL
    elif GateStatus.NOT_EVALUABLE in (feature.status, label.status):
        status = GateStatus.NOT_EVALUABLE
    else:
        status = GateStatus.PASS
    failures = dict(feature.failures)
    for key, messages in label.failures.items():
        failures.setdefault(key, []).extend(messages)
    return GateResult(
        name="degeneracy",
        status=status,
        failures=failures,
        ranges={**feature.ranges, **label.ranges},
        reason=feature.reason or label.reason,
    )


def evaluate_all_gates(
    seeds: Sequence[Mapping[str, Any]],
    *,
    leakage_windows: Mapping[str, Mapping[str, Sequence[Mapping[str, Any]]]] | None = None,
    temporal_label_builder_available: bool = False,
    exemptions: Sequence[CollinearityExemption] = (),
) -> dict[str, GateResult]:
    """Run the six acceptance gates, preserving NOT EVALUABLE as its own state.

    A1 deliberately calls this without the A4 temporal label builder, so leakage cannot
    silently turn green just because the event-window evidence does not exist yet.
    """
    leakage = judge_leakage_windows(leakage_windows or {}, evaluable=temporal_label_builder_available)
    feature_degeneracy = judge_feature_degeneracy(seeds)
    label_degeneracy = judge_label_degeneracy(seeds)
    return {
        "leakage": leakage,
        "archetype_recoverability": judge_archetype_recoverability(seeds),
        "conditional_independence": judge_conditional_independence(seeds),
        "degeneracy": _combine_degeneracy(feature_degeneracy, label_degeneracy),
        "plausibility": judge_plausibility(seeds),
        "label_composition": judge_label_composition(seeds, exemptions=exemptions),
    }
