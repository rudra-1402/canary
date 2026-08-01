import random
from datetime import datetime, timedelta

from generator.config import GeneratorConfig
from generator.timeline import build_timelines

SPECIAL_ROLE_GHOST_RATE = {"colluder": 0.02, "saboteur": 0.03}


def _month_index(created_at: datetime, now: datetime, timeline_months: int) -> int:
    window_start = now - timedelta(days=30 * timeline_months)
    raw = round((created_at - window_start).days / 30)
    return max(0, min(timeline_months, raw))


def _current_traits(profile: dict, month_index: int) -> dict:
    trajectory = profile["_traitTrajectory"]
    return trajectory[min(month_index, len(trajectory) - 1)]


def _ghost_probability_from_traits(traits: dict) -> float:
    combined = (traits["reliability"] + traits["responsiveness"]) / 2
    return min(0.9, max(0.005, 0.85 * (1 - combined) ** 1.8))


def _party_ghost_probability(profile: dict, month_index: int) -> float:
    if profile["trueArchetype"] in SPECIAL_ROLE_GHOST_RATE:
        return SPECIAL_ROLE_GHOST_RATE[profile["trueArchetype"]]
    return _ghost_probability_from_traits(_current_traits(profile, month_index))


def _miss_due_at_probability(config: GeneratorConfig, traits: dict) -> float:
    return min(
        1.0,
        config.late_miss_probability_floor
        + config.late_miss_probability_unreliability_weight * (1 - traits["reliability"]),
    )


def _days_late_from_traits(
    config: GeneratorConfig,
    traits: dict,
    missed_due_at: bool,
    magnitude_rng: random.Random,
) -> int:
    if missed_due_at:
        maximum_lateness = max(
            1, round(1 + config.late_days_unreliability_scale * (1 - traits["reliability"]))
        )
        return magnitude_rng.randint(1, maximum_lateness)

    if magnitude_rng.random() < config.early_delivery_probability:
        return -magnitude_rng.randint(1, config.early_delivery_max_days)
    return 0


def _paid_in_full_from_traits(config: GeneratorConfig, traits: dict, rng: random.Random) -> bool:
    probability = min(
        1.0,
        config.paid_in_full_probability_floor
        + config.paid_in_full_reliability_weight * traits["reliability"],
    )
    return rng.random() < probability


def _revisions_requested_from_traits(config: GeneratorConfig, traits: dict, rng: random.Random) -> int:
    requested = rng.gauss(
        config.revisions_requested_unreliability_scale * (1 - traits["reliability"]),
        config.revisions_requested_noise_std,
    )
    return max(0, round(requested))


def draw_relative_conduct(
    config: GeneratorConfig,
    profiles: list[dict],
    engagements: list[dict],
    *,
    now: datetime | None = None,
) -> list[dict]:
    """Draw conduct without assigning any absolute event time."""
    ghost_rng = random.Random(config.seed + 5)
    lateness_event_rng = random.Random(config.seed + 6)
    lateness_magnitude_rng = random.Random(config.seed + 7)
    payment_rng = random.Random(config.seed + 8)
    revisions_rng = random.Random(config.seed + 9)
    conclusion_rng = random.Random(config.seed + 10)
    profiles_by_id = {p["_localId"]: p for p in profiles}
    now = now or datetime.utcnow()
    conduct = []

    for engagement in engagements:
        if engagement["status"] != "concluded" and not engagement.get("_timelineDeferred"):
            continue

        freelancer = profiles_by_id[engagement["freelancerProfileLocalId"]]
        client = profiles_by_id[engagement["clientProfileLocalId"]]
        month_index = _month_index(engagement["createdAt"], now, config.timeline_months)

        freelancer_ghost_p = _party_ghost_probability(freelancer, month_index)
        client_ghost_p = _party_ghost_probability(client, month_index)
        freelancer_ghosted = ghost_rng.random() < freelancer_ghost_p
        client_ghosted = ghost_rng.random() < client_ghost_p
        ended_as = (
            "ghosted"
            if freelancer_ghosted or client_ghosted
            else conclusion_rng.choices(["completed", "cancelled"], weights=[0.9, 0.1])[0]
        )

        for subject, counterparty, subject_role, subject_ghosted, counterparty_ghosted in (
            (freelancer, client, "freelancer", freelancer_ghosted, client_ghosted),
            (client, freelancer, "client", client_ghosted, freelancer_ghosted),
        ):
            observed = subject_ghosted or not counterparty_ghosted
            conduct_observed = observed and not subject_ghosted
            outcome = {
                "_localId": f"outcome-{engagement['_localId']}-{subject['_localId']}",
                "engagementLocalId": engagement["_localId"],
                "subjectProfileLocalId": subject["_localId"],
                "counterpartyProfileLocalId": counterparty["_localId"],
                "subjectRole": subject_role,
                "observed": observed,
                "deliveredAt": None,
                "daysLate": None,
                "paidInFull": None,
                "revisionsRequested": None,
                "scopeCreepOccurred": None,
                "ghosted": subject_ghosted,
                "endedAs": ended_as,
                "labelSource": "synthetic",
            }

            if conduct_observed and subject_role == "freelancer":
                traits = _current_traits(subject, month_index)
                missed_due_at = lateness_event_rng.random() < _miss_due_at_probability(config, traits)
                days_late = _days_late_from_traits(config, traits, missed_due_at, lateness_magnitude_rng)
                outcome["daysLate"] = days_late

            if conduct_observed and subject_role == "client":
                traits = _current_traits(subject, month_index)
                revisions_requested = _revisions_requested_from_traits(config, traits, revisions_rng)
                outcome["paidInFull"] = _paid_in_full_from_traits(config, traits, payment_rng)
                outcome["revisionsRequested"] = revisions_requested
                outcome["scopeCreepOccurred"] = (
                    revisions_requested > engagement["agreedTerms"]["revisionsIncluded"]
                )

            conduct.append(outcome)

    return conduct


def generate_outcomes(
    config: GeneratorConfig,
    profiles: list[dict],
    engagements: list[dict],
    *,
    conduct: list[dict] | None = None,
    timelines: dict[str, dict] | None = None,
    now: datetime | None = None,
) -> list[dict]:
    """Materialize Outcome rows from relative conduct and the shared timeline."""
    now = now or datetime.utcnow()
    conduct = (
        conduct if conduct is not None else draw_relative_conduct(config, profiles, engagements, now=now)
    )
    timelines = timelines if timelines is not None else build_timelines(config, engagements, conduct, now=now)
    outcomes = []

    for relative_outcome in conduct:
        outcome = dict(relative_outcome)
        event_times = timelines.get(outcome["engagementLocalId"])
        if event_times is None:
            continue
        if outcome["subjectRole"] == "freelancer" and outcome["daysLate"] is not None:
            outcome["deliveredAt"] = event_times["deliveredAt"]
        outcome["recordedAt"] = event_times["recordedAt"]
        outcomes.append(outcome)

    return outcomes
