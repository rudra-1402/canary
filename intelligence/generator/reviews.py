import random
from faker import Faker
from generator.config import GeneratorConfig

RATING_WEIGHTS = {5: 0.55, 4: 0.25, 3: 0.1, 2: 0.05, 1: 0.05}


def _sample_rating(rng: random.Random, ghosted: bool) -> int:
    if ghosted:
        return rng.choices([1, 2], weights=[0.8, 0.2])[0]
    return rng.choices(list(RATING_WEIGHTS.keys()), weights=list(RATING_WEIGHTS.values()))[0]


def generate_reviews(
    config: GeneratorConfig,
    profiles: list[dict],
    engagements: list[dict],
    outcomes: list[dict],
    rings: list[dict],
) -> list[dict]:
    rng = random.Random(config.seed + 6)
    fake = Faker()
    Faker.seed(config.seed + 6)

    outcomes_by_engagement = {o["engagementLocalId"]: o for o in outcomes}
    engagements_by_local_id = {e["_localId"]: e for e in engagements}
    ring_member_ids = {m for ring in rings for m in ring["memberLocalIds"]}
    profiles_by_id = {p["_localId"]: p for p in profiles}

    reviews = []

    for engagement in engagements:
        outcome = outcomes_by_engagement.get(engagement["_localId"])
        if outcome is None or rng.random() > 0.85:
            continue

        freelancer_id = engagement["freelancerProfileLocalId"]
        client_id = engagement["clientProfileLocalId"]
        both_ring_members = freelancer_id in ring_member_ids and client_id in ring_member_ids

        for author_id, subject_id in ((freelancer_id, client_id), (client_id, freelancer_id)):
            if rng.random() > 0.9:
                continue

            is_planted_collusion = both_ring_members
            rating = 5 if is_planted_collusion else _sample_rating(rng, outcome["ghosted"])

            reviews.append(
                {
                    "_localId": f"review-{engagement['_localId']}-{author_id}",
                    "engagementLocalId": engagement["_localId"],
                    "authorProfileLocalId": author_id,
                    "subjectProfileLocalId": subject_id,
                    "rating": rating,
                    "text": fake.sentence(),
                    "isPlantedCollusion": is_planted_collusion,
                    "isPlantedSabotage": False,
                }
            )

    saboteurs = [p for p in profiles if p["trueArchetype"] == "saboteur"]
    reliable_targets = [p for p in profiles if p["trueArchetype"] == "reliable"]
    for saboteur in saboteurs:
        if not reliable_targets:
            break
        victim = rng.choice(reliable_targets)
        matching_engagement = next(
            (
                e
                for e in engagements
                if saboteur["_localId"] in (e["freelancerProfileLocalId"], e["clientProfileLocalId"])
            ),
            None,
        )
        if matching_engagement is None:
            continue
        reviews.append(
            {
                "_localId": f"review-sabotage-{saboteur['_localId']}-{victim['_localId']}",
                "engagementLocalId": matching_engagement["_localId"],
                "authorProfileLocalId": saboteur["_localId"],
                "subjectProfileLocalId": victim["_localId"],
                "rating": 1,
                "text": fake.sentence(),
                "isPlantedCollusion": False,
                "isPlantedSabotage": True,
            }
        )

    return reviews
