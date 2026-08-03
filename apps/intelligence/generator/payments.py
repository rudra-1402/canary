import random
from datetime import datetime

from generator.clock import resolve_now
from generator.config import GeneratorConfig
from generator.timeline import build_timelines


def generate_payments(
    config: GeneratorConfig,
    profiles: list[dict],
    engagements: list[dict],
    conduct: list[dict],
    timelines: dict[str, dict] | None = None,
    *,
    now: datetime | None = None,
) -> list[dict]:
    rng = random.Random(config.seed + 7)
    now = resolve_now(config, now)
    timelines = timelines if timelines is not None else build_timelines(config, engagements, conduct, now=now)
    outcomes_by_engagement_and_subject = {
        (outcome["engagementLocalId"], outcome["subjectProfileLocalId"]): outcome for outcome in conduct
    }
    payments = []

    for engagement in engagements:
        if engagement["_localId"] not in timelines:
            continue
        outcome = outcomes_by_engagement_and_subject.get(
            (engagement["_localId"], engagement["clientProfileLocalId"])
        )
        if outcome is None or not outcome["paidInFull"]:
            continue

        payments.append(
            {
                "_localId": f"payment-{engagement['_localId']}",
                "freelancerProfileLocalId": engagement["freelancerProfileLocalId"],
                "engagementLocalId": engagement["_localId"],
                "amount": engagement["agreedTerms"]["price"],
                "receivedAt": timelines[engagement["_localId"]]["receivedAt"],
                "importSource": rng.choice(["manual", "csv", "stripe-test"]),
            }
        )

    return payments
