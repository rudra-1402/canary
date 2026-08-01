import random
from datetime import datetime, timedelta

from generator.config import GeneratorConfig


def _client_of(jobposts: list[dict], jobpost_local_id: str) -> str:
    return next(jp["clientProfileLocalId"] for jp in jobposts if jp["_localId"] == jobpost_local_id)


def generate_engagements(
    config: GeneratorConfig, profiles: list[dict], jobposts: list[dict], proposals: list[dict]
) -> list[dict]:
    rng = random.Random(config.seed + 3)
    profiles_by_id = {p["_localId"]: p for p in profiles}
    now = datetime.utcnow()

    engagements = []
    proposals_by_jobpost: dict[str, list[dict]] = {}
    for proposal in proposals:
        proposals_by_jobpost.setdefault(proposal["jobPostLocalId"], []).append(proposal)

    for jobpost_id, jobpost_proposals in proposals_by_jobpost.items():
        if rng.random() > 0.7:
            continue
        accepted = rng.choice(jobpost_proposals)
        client_id = _client_of(jobposts, jobpost_id)
        client = profiles_by_id[client_id]

        # Clamped to "now" as a second line of defense — a proposal chained off a
        # very-recently-joined client's jobpost may not have full buffer room
        # left before "now" (see jobposts.py).
        created_at = min(accepted["createdAt"] + timedelta(days=rng.randint(1, 10)), now)
        status = rng.choices(["active", "concluded"], weights=[0.2, 0.8])[0]

        bad_terms = client["trueArchetype"] == "reliable" and rng.random() < 0.1

        engagement = {
            "_localId": f"engagement-{jobpost_id}",
            "freelancerProfileLocalId": accepted["freelancerProfileLocalId"],
            "clientProfileLocalId": client_id,
            "jobPostLocalId": jobpost_id,
            "proposalLocalId": accepted["_localId"],
            "status": status,
            "createdAt": created_at,
            "badTerms": bad_terms,
            "agreedTerms": {
                "scope": "As proposed",
                "price": accepted["bid"],
                "paymentTerms": "net-90" if bad_terms else rng.choice(["net-15", "net-30"]),
                "timeline": accepted["durationEstimate"],
                "dueAt": created_at + timedelta(days=accepted["proposedDurationDays"]),
                "revisionsIncluded": rng.randint(
                    config.revisions_included_min, config.revisions_included_max
                ),
            },
        }
        engagements.append(engagement)

    return engagements
