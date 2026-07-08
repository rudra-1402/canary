import random
from datetime import timedelta
from faker import Faker
from generator.config import GeneratorConfig


def generate_proposals(config: GeneratorConfig, profiles: list[dict], jobposts: list[dict]) -> list[dict]:
    rng = random.Random(config.seed + 2)
    fake = Faker()
    Faker.seed(config.seed + 2)

    freelancers = [p for p in profiles if p["role"] == "freelancer"]
    proposals = []

    for jobpost in jobposts:
        num_proposals = rng.randint(2, 8)
        applicants = rng.sample(freelancers, k=min(num_proposals, len(freelancers)))
        for freelancer in applicants:
            base = jobpost["budgetOrRate"]
            bid = round(base * rng.uniform(0.8, 1.15), 2)
            created_at = jobpost["createdAt"] + timedelta(days=rng.randint(1, 14))
            proposals.append(
                {
                    "_localId": f"proposal-{jobpost['_localId']}-{freelancer['_localId']}",
                    "jobPostLocalId": jobpost["_localId"],
                    "freelancerProfileLocalId": freelancer["_localId"],
                    "bid": bid,
                    "payModel": rng.choice(["project", "milestone"]),
                    "durationEstimate": f"{rng.randint(1, 12)} weeks",
                    "coverLetter": fake.paragraph(nb_sentences=2),
                    "status": "submitted",
                    "createdAt": created_at,
                }
            )

    return proposals
