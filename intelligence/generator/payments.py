import random
from datetime import timedelta
from generator.config import GeneratorConfig


def generate_payments(
    config: GeneratorConfig, profiles: list[dict], engagements: list[dict], outcomes: list[dict]
) -> list[dict]:
    rng = random.Random(config.seed + 7)
    outcomes_by_engagement = {o["engagementLocalId"]: o for o in outcomes}
    payments = []

    for engagement in engagements:
        outcome = outcomes_by_engagement.get(engagement["_localId"])
        if outcome is None or not outcome["paidInFull"]:
            continue

        received_at = engagement["createdAt"] + timedelta(
            days=30 + (outcome["daysLate"] or 0)
        )
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
