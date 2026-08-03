import random
from datetime import datetime, timedelta

from generator import corpus
from generator.clock import resolve_now
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


def generate_jobposts(
    config: GeneratorConfig, profiles: list[dict], *, now: datetime | None = None
) -> list[dict]:
    rng = random.Random(config.seed + 1)
    # A dedicated stream for category/skills/title/description. Composing text
    # necessarily consumes a different number of draws than the record it
    # replaces (fake.job()/fake.paragraph() drew from their own Faker
    # instance, never from `rng`) -- keeping that consumption off `rng`
    # preserves the createdAt/budgetOrRate/etc. distribution `rng` already
    # produces for every other stage of the pipeline that reads a jobpost.
    corpus_rng = random.Random(f"jobpost-corpus:{config.seed}")

    now = resolve_now(config, now)

    clients = [p for p in profiles if p["role"] == "client"]
    jobposts = []

    for client in clients:
        num_posts = round(rng.randint(1, 4) * config.engagement_fanout_multiplier)
        for j in range(num_posts):
            planted_red_flags = []
            created_at = _jobpost_created_at(rng, client, now)

            category = corpus_rng.choice(corpus.CATEGORIES)
            skill_pool = corpus.CATEGORY_SKILLS[category]
            # Variable count, not a fixed 2 -- a fixed skill count is itself a
            # visible tell on a list screen.
            num_skills = corpus_rng.randint(1, min(4, len(skill_pool)))
            skills = corpus_rng.sample(skill_pool, k=num_skills)
            job_type = rng.choice(["hourly", "fixed"])
            budget_or_rate = rng.randint(200, 8000)
            experience_level = rng.choice(["entry", "intermediate", "expert"])
            project_length = rng.choice(
                ["less-than-1-month", "1-to-3-months", "3-to-6-months", "more-than-6-months"]
            )

            title = corpus.compose_job_title(corpus_rng, category, skills)
            description = corpus.compose_job_description(
                corpus_rng,
                category=category,
                skills=skills,
                job_type=job_type,
                budget_or_rate=budget_or_rate,
                experience_level=experience_level,
                project_length=project_length,
            )

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
                    "title": title,
                    "category": category,
                    "description": description,
                    "skills": skills,
                    "jobType": job_type,
                    "budgetOrRate": budget_or_rate,
                    "experienceLevel": experience_level,
                    "projectLength": project_length,
                    "status": "open",
                    "plantedRedFlags": planted_red_flags,
                    "createdAt": created_at,
                }
            )

    return jobposts
