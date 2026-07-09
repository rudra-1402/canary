import random
from datetime import datetime, timedelta

from generator.config import GeneratorConfig

SPECIAL_ROLE_GHOST_RATE = {"colluder": 0.02, "saboteur": 0.03}
SPECIAL_ROLE_LATE_DAYS_RANGE = {"colluder": (0, 3), "saboteur": (0, 5)}


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


def _late_days_range_from_traits(traits: dict) -> tuple[int, int]:
    reliability = traits["reliability"]
    low = round(20 * (1 - reliability))
    high = round(2 + 100 * (1 - reliability) ** 2)
    return max(0, low), max(low + 1, high)


def _party_ghost_probability(profile: dict, month_index: int) -> float:
    if profile["trueArchetype"] in SPECIAL_ROLE_GHOST_RATE:
        return SPECIAL_ROLE_GHOST_RATE[profile["trueArchetype"]]
    return _ghost_probability_from_traits(_current_traits(profile, month_index))


def _party_late_days_range(profile: dict, month_index: int) -> tuple[int, int]:
    if profile["trueArchetype"] in SPECIAL_ROLE_LATE_DAYS_RANGE:
        return SPECIAL_ROLE_LATE_DAYS_RANGE[profile["trueArchetype"]]
    return _late_days_range_from_traits(_current_traits(profile, month_index))


def generate_outcomes(config: GeneratorConfig, profiles: list[dict], engagements: list[dict]) -> list[dict]:
    rng = random.Random(config.seed + 5)
    profiles_by_id = {p["_localId"]: p for p in profiles}
    now = datetime.utcnow()
    outcomes = []

    for engagement in engagements:
        if engagement["status"] != "concluded":
            continue

        freelancer = profiles_by_id[engagement["freelancerProfileLocalId"]]
        client = profiles_by_id[engagement["clientProfileLocalId"]]
        month_index = _month_index(engagement["createdAt"], now, config.timeline_months)

        freelancer_ghost_p = _party_ghost_probability(freelancer, month_index)
        client_ghost_p = _party_ghost_probability(client, month_index)
        if freelancer_ghost_p >= client_ghost_p:
            worse_profile, ghost_p = freelancer, freelancer_ghost_p
        else:
            worse_profile, ghost_p = client, client_ghost_p

        ghosted = rng.random() < ghost_p
        low, high = _party_late_days_range(worse_profile, month_index)
        days_late = 0 if ghosted else rng.randint(low, high)
        scope_creep = rng.random() < (0.3 if ghost_p > 0.15 else 0.05)

        outcomes.append(
            {
                "_localId": f"outcome-{engagement['_localId']}",
                "engagementLocalId": engagement["_localId"],
                "paidInFull": not ghosted and rng.random() < 0.95,
                "daysLate": days_late if not ghosted else None,
                "scopeCreepOccurred": scope_creep,
                "ghosted": ghosted,
                "endedAs": (
                    "ghosted" if ghosted else rng.choices(["completed", "cancelled"], weights=[0.9, 0.1])[0]
                ),
                "labelSource": "synthetic",
            }
        )

    return outcomes
