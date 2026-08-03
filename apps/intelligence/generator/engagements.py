import random
from datetime import datetime, timedelta

from generator.clock import resolve_now
from generator.config import GeneratorConfig
from generator.timeline import max_chronology_days


def generate_engagements(
    config: GeneratorConfig,
    profiles: list[dict],
    jobposts: list[dict],
    proposals: list[dict],
    *,
    now: datetime | None = None,
) -> list[dict]:
    rng = random.Random(config.seed + 3)
    profiles_by_id = {p["_localId"]: p for p in profiles}
    jobposts_by_id = {jobpost["_localId"]: jobpost for jobpost in jobposts}
    now = resolve_now(config, now)

    engagements = []
    proposals_by_jobpost: dict[str, list[dict]] = {}
    for proposal in proposals:
        proposals_by_jobpost.setdefault(proposal["jobPostLocalId"], []).append(proposal)

    for jobpost_id, jobpost_proposals in proposals_by_jobpost.items():
        if rng.random() > 0.7:
            continue
        accepted = rng.choice(jobpost_proposals)
        accepted["status"] = "accepted"
        for proposal in jobpost_proposals:
            if proposal is not accepted:
                proposal["status"] = "declined"
        jobpost = jobposts_by_id[jobpost_id]
        jobpost["status"] = "closed"
        client_id = jobpost["clientProfileLocalId"]
        client = profiles_by_id[client_id]

        # Clamped to "now" as a second line of defense — a proposal chained off a
        # very-recently-joined client's jobpost may not have full buffer room
        # left before "now" (see jobposts.py).
        created_at = min(accepted["createdAt"] + timedelta(days=rng.randint(1, 10)), now)
        status = rng.choices(["active", "concluded"], weights=[0.2, 0.8])[0]

        bad_terms = client["trueArchetype"] == "reliable" and rng.random() < 0.1

        due_at = created_at + timedelta(days=accepted["proposedDurationDays"])
        # The shared conclusion timeline can include maximum lateness, a
        # payment event, and a conclusion event. Do not label an engagement
        # concluded unless that full chronology can already have elapsed.
        timeline_deferred = (
            status == "concluded" and due_at + timedelta(days=max_chronology_days(config)) > now
        )
        if timeline_deferred:
            status = "active"

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
                "dueAt": due_at,
                "revisionsIncluded": rng.randint(
                    config.revisions_included_min, config.revisions_included_max
                ),
            },
        }
        if timeline_deferred:
            # Preserve the pre-timeline conduct RNG sequence without emitting
            # an incoherent concluded Engagement or any documents for it.
            engagement["_timelineDeferred"] = True
        engagements.append(engagement)

    return engagements
