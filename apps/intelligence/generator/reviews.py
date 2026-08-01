import random

from faker import Faker

from generator.config import GeneratorConfig

RATING_WEIGHTS = {5: 0.55, 4: 0.25, 3: 0.1, 2: 0.05, 1: 0.05}


def _sample_rating(rng: random.Random, ghosted: bool) -> int:
    if ghosted:
        return rng.choices([1, 2], weights=[0.8, 0.2])[0]
    return rng.choices(list(RATING_WEIGHTS.keys()), weights=list(RATING_WEIGHTS.values()))[0]


def _subject_conduct_is_good(outcome: dict) -> bool:
    if not outcome["observed"] or outcome["ghosted"]:
        return False
    if outcome["subjectRole"] == "freelancer":
        return outcome["daysLate"] is not None and outcome["daysLate"] <= 0
    return outcome["paidInFull"] is True and outcome["scopeCreepOccurred"] is False


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

    outcomes_by_engagement_and_subject = {
        (outcome["engagementLocalId"], outcome["subjectProfileLocalId"]): outcome for outcome in outcomes
    }
    ring_member_ids = {m for ring in rings for m in ring["memberLocalIds"]}

    reviews = []
    review_counts: dict[str, int] = {}
    review_authors = set()

    saboteurs = [p for p in profiles if p["trueArchetype"] == "saboteur"]
    for saboteur in saboteurs:
        saboteur_id = saboteur["_localId"]
        candidates = []
        for engagement in engagements:
            freelancer_id = engagement["freelancerProfileLocalId"]
            client_id = engagement["clientProfileLocalId"]
            if saboteur_id not in (freelancer_id, client_id):
                continue
            subject_id = client_id if saboteur_id == freelancer_id else freelancer_id
            outcome = outcomes_by_engagement_and_subject.get((engagement["_localId"], subject_id))
            if (
                outcome is not None
                and _subject_conduct_is_good(outcome)
                and review_counts.get(engagement["_localId"], 0) < 2
                and (engagement["_localId"], saboteur_id) not in review_authors
            ):
                candidates.append((engagement, subject_id))

        rng.shuffle(candidates)
        for matching_engagement, subject_id in candidates[:2]:
            engagement_id = matching_engagement["_localId"]
            if review_counts.get(engagement_id, 0) >= 2 or (engagement_id, saboteur_id) in review_authors:
                continue
            reviews.append(
                {
                    "_localId": f"review-sabotage-{engagement_id}-{saboteur_id}",
                    "engagementLocalId": engagement_id,
                    "authorProfileLocalId": saboteur_id,
                    "subjectProfileLocalId": subject_id,
                    "rating": rng.choice([1, 2, 3]),
                    "text": fake.sentence(),
                    "isPlantedCollusion": False,
                    "isPlantedSabotage": True,
                }
            )
            review_counts[engagement_id] = review_counts.get(engagement_id, 0) + 1
            review_authors.add((engagement_id, saboteur_id))

    for engagement in engagements:
        freelancer_id = engagement["freelancerProfileLocalId"]
        client_id = engagement["clientProfileLocalId"]
        if (
            engagement["_localId"],
            freelancer_id,
        ) not in outcomes_by_engagement_and_subject or rng.random() > 0.85:
            continue

        both_ring_members = freelancer_id in ring_member_ids and client_id in ring_member_ids

        for author_id, subject_id in ((freelancer_id, client_id), (client_id, freelancer_id)):
            if (
                review_counts.get(engagement["_localId"], 0) >= 2
                or (engagement["_localId"], author_id) in review_authors
                or rng.random() > 0.9
            ):
                continue

            outcome = outcomes_by_engagement_and_subject.get((engagement["_localId"], subject_id))
            if outcome is None:
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
            review_counts[engagement["_localId"]] = review_counts.get(engagement["_localId"], 0) + 1
            review_authors.add((engagement["_localId"], author_id))

    return reviews
