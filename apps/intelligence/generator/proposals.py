import random
from datetime import datetime, timedelta

from faker import Faker

from generator.clock import resolve_now
from generator.config import GeneratorConfig


def generate_proposals(
    config: GeneratorConfig, profiles: list[dict], jobposts: list[dict], *, now: datetime | None = None
) -> list[dict]:
    rng = random.Random(config.seed + 2)
    fake = Faker()
    Faker.seed(config.seed + 2)

    now = resolve_now(config, now)
    freelancers = [p for p in profiles if p["role"] == "freelancer"]
    proposals = []

    for jobpost in jobposts:
        num_proposals = rng.randint(2, 8)
        applicants = rng.sample(freelancers, k=min(num_proposals, len(freelancers)))
        for freelancer in applicants:
            base = jobpost["budgetOrRate"]
            bid = round(base * rng.uniform(0.8, 1.15), 2)
            proposed_duration_days = rng.randint(
                config.proposal_duration_min_days, config.proposal_duration_max_days
            )
            # Clamped to "now" — a jobpost from a very-recently-joined client may
            # not have the full 14-day buffer available (see jobposts.py).
            created_at = min(jobpost["createdAt"] + timedelta(days=rng.randint(1, 14)), now)
            proposals.append(
                {
                    "_localId": f"proposal-{jobpost['_localId']}-{freelancer['_localId']}",
                    "jobPostLocalId": jobpost["_localId"],
                    "freelancerProfileLocalId": freelancer["_localId"],
                    "bid": bid,
                    "payModel": rng.choice(["project", "milestone"]),
                    "durationEstimate": f"{proposed_duration_days} days",
                    "proposedDurationDays": proposed_duration_days,
                    "coverLetter": fake.paragraph(nb_sentences=2),
                    "status": "submitted",
                    "createdAt": created_at,
                }
            )

    return proposals
