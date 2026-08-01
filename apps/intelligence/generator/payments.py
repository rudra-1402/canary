import random
from datetime import datetime, timedelta

from generator.config import GeneratorConfig


def generate_payments(
    config: GeneratorConfig, profiles: list[dict], engagements: list[dict], outcomes: list[dict]
) -> list[dict]:
    rng = random.Random(config.seed + 7)
    now = datetime.utcnow()
    outcomes_by_engagement_and_subject = {
        (outcome["engagementLocalId"], outcome["subjectProfileLocalId"]): outcome for outcome in outcomes
    }
    payments = []

    for engagement in engagements:
        outcome = outcomes_by_engagement_and_subject.get(
            (engagement["_localId"], engagement["clientProfileLocalId"])
        )
        if outcome is None or not outcome["paidInFull"]:
            continue

        # Clamped to "now" — same defense as jobposts/proposals/engagements:
        # a late payment (daysLate up to ~100) on an engagement created close
        # to "now" could otherwise land in the future.
        received_at = min(engagement["createdAt"] + timedelta(days=30 + (outcome["daysLate"] or 0)), now)
        payments.append(
            {
                "_localId": f"payment-{engagement['_localId']}",
                "freelancerProfileLocalId": engagement["freelancerProfileLocalId"],
                "engagementLocalId": engagement["_localId"],
                "amount": engagement["agreedTerms"]["price"],
                "receivedAt": received_at,
                "importSource": rng.choice(["manual", "csv", "stripe-test"]),
            }
        )

    return payments
