import random
from datetime import datetime, timedelta

from generator import corpus
from generator.clock import resolve_now
from generator.config import GeneratorConfig


def generate_proposals(
    config: GeneratorConfig, profiles: list[dict], jobposts: list[dict], *, now: datetime | None = None
) -> list[dict]:
    rng = random.Random(config.seed + 2)
    # Dedicated stream for the cover letter text -- see generator/jobposts.py
    # for why composed text must not share the structural rng that drives
    # bid/duration/payModel, all of which downstream trust-score code reads.
    corpus_rng = random.Random(f"proposal-corpus:{config.seed}")

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
            cover_letter = corpus.compose_cover_letter(
                corpus_rng,
                category=jobpost["category"],
                skills=jobpost["skills"],
                bid=bid,
                proposed_duration_days=proposed_duration_days,
            )
            proposals.append(
                {
                    "_localId": f"proposal-{jobpost['_localId']}-{freelancer['_localId']}",
                    "jobPostLocalId": jobpost["_localId"],
                    "freelancerProfileLocalId": freelancer["_localId"],
                    "bid": bid,
                    "payModel": rng.choice(["project", "milestone"]),
                    "durationEstimate": f"{proposed_duration_days} days",
                    "proposedDurationDays": proposed_duration_days,
                    "coverLetter": cover_letter,
                    "status": "submitted",
                    "createdAt": created_at,
                }
            )

    return proposals
