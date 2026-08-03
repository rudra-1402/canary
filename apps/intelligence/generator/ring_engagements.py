import random
from datetime import datetime, timedelta

from faker import Faker

from generator.clock import resolve_now
from generator.config import GeneratorConfig
from generator.timeline import max_chronology_days

# Same categorical vocab as generator/jobposts.py and generator/proposals.py --
# ring-forced records must be indistinguishable in shape from organic ones.
_CATEGORIES = ["web-development", "design", "writing", "marketing"]
_SKILLS = ["react", "node", "python", "seo", "copywriting"]
_JOB_TYPES = ["hourly", "fixed"]
_EXPERIENCE_LEVELS = ["entry", "intermediate", "expert"]
_PROJECT_LENGTHS = ["less-than-1-month", "1-to-3-months", "3-to-6-months", "more-than-6-months"]
_PAY_MODELS = ["project", "milestone"]

# Kept short and fixed rather than drawn from the full proposal-duration range:
# a forced ring engagement needs the smallest defensible chronology so it has
# the best chance of clearing max_chronology_days() before "now", even for a
# ring member who joined late.
_RING_DURATION_DAYS = 14


def _earliest_workable_created_at(
    client: dict, freelancer: dict, config: GeneratorConfig, now: datetime
) -> datetime:
    """The earliest moment both ring counterparties could plausibly have posted
    and accepted work -- one day after whichever of them joined later."""
    return max(client["createdAt"], freelancer["createdAt"]) + timedelta(days=1)


def build_ring_engagements(
    config: GeneratorConfig,
    profiles: list[dict],
    rings: list[dict],
    *,
    now: datetime | None = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Force one real jobpost -> proposal -> engagement chain per client/freelancer
    pair inside each planted collusion ring.

    `generator/collusion_rings.py` only ever labels ring membership; nothing
    consumed the ring graph to make ring-mates actually transact, so ring
    membership left no behavioural fingerprint for ~89% of planted colluders.
    This is the consumer: for every ring, every (client, freelancer) pair
    inside it gets a real engagement, built with the exact same record shapes
    `generator/jobposts.py`, `generator/proposals.py` and
    `generator/engagements.py` produce, so it flows through
    `draw_relative_conduct` / `build_timelines` / `generate_outcomes` /
    `generate_reviews` unmodified -- no parallel outcome or review path.

    An engagement is only marked "concluded" when its chronology can already
    have elapsed by `now` (mirroring engagements.py's own guard); otherwise it
    is left "active" so it never produces an incoherent future timestamp.
    """
    rng = random.Random(config.seed + 21)
    fake = Faker()
    Faker.seed(config.seed + 21)
    now = resolve_now(config, now)
    profiles_by_id = {p["_localId"]: p for p in profiles}
    buffer_days = max_chronology_days(config)

    jobposts: list[dict] = []
    proposals: list[dict] = []
    engagements: list[dict] = []

    for ring in rings:
        members = ring["memberLocalIds"]
        ring_clients = [m for m in members if profiles_by_id[m]["role"] == "client"]
        ring_freelancers = [m for m in members if profiles_by_id[m]["role"] == "freelancer"]

        pair_index = 0
        for client_id in ring_clients:
            client = profiles_by_id[client_id]
            for freelancer_id in ring_freelancers:
                freelancer = profiles_by_id[freelancer_id]
                local_suffix = f"{ring['_localId']}-{pair_index}"
                pair_index += 1

                earliest = _earliest_workable_created_at(client, freelancer, config, now)
                jobpost_created_at = min(earliest, now)

                jobpost_id = f"ring-jobpost-{local_suffix}"
                jobposts.append(
                    {
                        "_localId": jobpost_id,
                        "clientProfileLocalId": client_id,
                        "title": fake.job(),
                        "category": rng.choice(_CATEGORIES),
                        "description": fake.paragraph(nb_sentences=3),
                        "skills": rng.sample(_SKILLS, k=2),
                        "jobType": rng.choice(_JOB_TYPES),
                        "budgetOrRate": rng.randint(200, 8000),
                        "experienceLevel": rng.choice(_EXPERIENCE_LEVELS),
                        "projectLength": rng.choice(_PROJECT_LENGTHS),
                        "status": "closed",
                        "plantedRedFlags": [],
                        "createdAt": jobpost_created_at,
                    }
                )

                proposal_created_at = min(jobpost_created_at + timedelta(days=1), now)
                bid = round(rng.uniform(200, 8000), 2)
                proposal_id = f"ring-proposal-{local_suffix}"
                proposals.append(
                    {
                        "_localId": proposal_id,
                        "jobPostLocalId": jobpost_id,
                        "freelancerProfileLocalId": freelancer_id,
                        "bid": bid,
                        "payModel": rng.choice(_PAY_MODELS),
                        "durationEstimate": f"{_RING_DURATION_DAYS} days",
                        "proposedDurationDays": _RING_DURATION_DAYS,
                        "coverLetter": fake.paragraph(nb_sentences=2),
                        "status": "accepted",
                        "createdAt": proposal_created_at,
                    }
                )

                engagement_created_at = min(proposal_created_at + timedelta(days=1), now)
                due_at = engagement_created_at + timedelta(days=_RING_DURATION_DAYS)
                can_conclude = due_at + timedelta(days=buffer_days) <= now
                status = "concluded" if can_conclude else "active"

                engagement_id = f"ring-engagement-{local_suffix}"
                engagement = {
                    "_localId": engagement_id,
                    "freelancerProfileLocalId": freelancer_id,
                    "clientProfileLocalId": client_id,
                    "jobPostLocalId": jobpost_id,
                    "proposalLocalId": proposal_id,
                    "status": status,
                    "createdAt": engagement_created_at,
                    "badTerms": False,
                    "agreedTerms": {
                        "scope": "As proposed",
                        "price": bid,
                        "paymentTerms": rng.choice(["net-15", "net-30"]),
                        "timeline": f"{_RING_DURATION_DAYS} days",
                        "dueAt": due_at,
                        "revisionsIncluded": rng.randint(
                            config.revisions_included_min, config.revisions_included_max
                        ),
                    },
                }
                if not can_conclude:
                    # Same semantics as engagements.py's own deferral flag:
                    # preserve conduct-RNG consumption without a timeline that
                    # would raise for insufficient elapsed time.
                    engagement["_timelineDeferred"] = True
                engagements.append(engagement)

    return jobposts, proposals, engagements
