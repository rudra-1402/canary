import random
from datetime import datetime, timedelta

from faker import Faker

from generator.config import GeneratorConfig

RED_FLAG_PHRASES = {
    "vagueness": "we'll figure out the details as we go",
    "exposureForPayLanguage": "great exposure opportunity, budget flexible later",
    "urgencyPressure": "need this done ASAP, today if possible",
    "missingTerms": "",
}


# Downstream stages add further delay on top of a jobpost's createdAt: a
# Proposal can land up to 14 days later, and an Engagement up to 10 days after
# that (see proposals.py / engagements.py). Reserve enough buffer before "now"
# so those chained offsets can never push a later timestamp past the present —
# for the common case. For a client who joined very recently (e.g. cold-start,
# within the last cold_start_recent_months), there may not be room for the full
# buffer before "now" at all; proposals.py/engagements.py independently clamp
# their own output to "now" as a second line of defense for exactly that case,
# so a compressed/no-buffer jobpost here still can't produce a future timestamp
# downstream.
_DOWNSTREAM_BUFFER_DAYS = 14 + 10 + 1


def _jobpost_created_at(rng: random.Random, client: dict, now: datetime) -> datetime:
    earliest = client["createdAt"] + timedelta(days=1)
    latest = now - timedelta(days=_DOWNSTREAM_BUFFER_DAYS)
    if earliest >= latest:
        # Not enough natural room (client joined too recently) — clamp to "now"
        # rather than returning `earliest` unclamped, which could otherwise be
        # in the future relative to "now" (client.createdAt can be as late as
        # "now" itself for a same-day join).
        return min(earliest, now)
    span_days = (latest - earliest).days
    return earliest + timedelta(days=rng.randint(0, span_days))


def generate_jobposts(config: GeneratorConfig, profiles: list[dict]) -> list[dict]:
    rng = random.Random(config.seed + 1)
    fake = Faker()
    Faker.seed(config.seed + 1)

    now = datetime.utcnow()

    clients = [p for p in profiles if p["role"] == "client"]
    jobposts = []

    for client in clients:
        num_posts = rng.randint(1, 4)
        for j in range(num_posts):
            planted_red_flags = []
            description = fake.paragraph(nb_sentences=3)
            created_at = _jobpost_created_at(rng, client, now)

            if client["trueArchetype"] == "cold-start" and rng.random() < 0.7:
                flags_to_plant = rng.sample(
                    ["vagueness", "exposureForPayLanguage", "urgencyPressure", "missingTerms"],
                    k=rng.randint(1, 2),
                )
                for flag in flags_to_plant:
                    if RED_FLAG_PHRASES[flag]:
                        description += " " + RED_FLAG_PHRASES[flag] + "."
                    planted_red_flags.append(flag)

            jobposts.append(
                {
                    "_localId": f"jobpost-{client['_localId']}-{j}",
                    "clientProfileLocalId": client["_localId"],
                    "title": fake.job(),
                    "category": rng.choice(["web-development", "design", "writing", "marketing"]),
                    "description": description,
                    "skills": rng.sample(["react", "node", "python", "seo", "copywriting"], k=2),
                    "jobType": rng.choice(["hourly", "fixed"]),
                    "budgetOrRate": rng.randint(200, 8000),
                    "experienceLevel": rng.choice(["entry", "intermediate", "expert"]),
                    "projectLength": rng.choice(
                        ["less-than-1-month", "1-to-3-months", "3-to-6-months", "more-than-6-months"]
                    ),
                    "status": "open",
                    "plantedRedFlags": planted_red_flags,
                    "createdAt": created_at,
                }
            )

    return jobposts
