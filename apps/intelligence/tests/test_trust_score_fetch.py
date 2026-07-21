from datetime import datetime

from bson import ObjectId

from trust_score.fetch import load_dataset


def test_load_dataset_indexes_outcomes_by_both_parties_and_reviews_by_subject(mongo_db):
    freelancer_id = ObjectId()
    client_id = ObjectId()
    engagement_id = ObjectId()
    outcome_id = ObjectId()
    now = datetime.utcnow()

    mongo_db.profiles.insert_many(
        [
            {
                "_id": freelancer_id,
                "role": "freelancer",
                "identityId": ObjectId(),
                "origin": "synthetic-seeded",
                "displayName": "F",
                "createdAt": now,
            },
            {
                "_id": client_id,
                "role": "client",
                "identityId": ObjectId(),
                "origin": "synthetic-seeded",
                "displayName": "C",
                "createdAt": now,
            },
        ]
    )
    mongo_db.engagements.insert_one(
        {
            "_id": engagement_id,
            "freelancerProfileId": freelancer_id,
            "clientProfileId": client_id,
            "status": "concluded",
            "agreedTerms": {"scope": "x", "price": 100, "paymentTerms": "net-15", "timeline": "2w"},
            "createdAt": now,
        }
    )
    mongo_db.outcomes.insert_one(
        {
            "_id": outcome_id,
            "engagementId": engagement_id,
            "paidInFull": True,
            "daysLate": 0,
            "scopeCreepOccurred": False,
            "ghosted": False,
            "endedAs": "completed",
            "labelSource": "synthetic",
            "recordedAt": now,
            "createdAt": now,
        }
    )
    mongo_db.reviews.insert_one(
        {
            "engagementId": engagement_id,
            "authorProfileId": freelancer_id,
            "subjectProfileId": client_id,
            "rating": 5,
            "text": "great",
            "createdAt": now,
        }
    )

    try:
        dataset = load_dataset(mongo_db)
        freelancer_outcome_ids = {o["_id"] for o in dataset["outcomes_by_profile"].get(freelancer_id, [])}
        client_outcome_ids = {o["_id"] for o in dataset["outcomes_by_profile"].get(client_id, [])}
        assert outcome_id in freelancer_outcome_ids
        assert outcome_id in client_outcome_ids
        assert len(dataset["reviews_by_subject"].get(client_id, [])) == 1
        assert len(dataset["reviews_by_subject"].get(freelancer_id, [])) == 0
        profile_ids = {p["_id"] for p in dataset["profiles"]}
        assert {freelancer_id, client_id} <= profile_ids
    finally:
        mongo_db.profiles.delete_many({"_id": {"$in": [freelancer_id, client_id]}})
        mongo_db.engagements.delete_one({"_id": engagement_id})
        mongo_db.outcomes.delete_one({"_id": outcome_id})
        mongo_db.reviews.delete_many({"engagementId": engagement_id})


def test_load_dataset_ignores_non_concluded_engagements(mongo_db):
    freelancer_id, client_id, engagement_id = ObjectId(), ObjectId(), ObjectId()
    now = datetime.utcnow()
    mongo_db.profiles.insert_many(
        [
            {
                "_id": freelancer_id,
                "role": "freelancer",
                "identityId": ObjectId(),
                "origin": "synthetic-seeded",
                "displayName": "F",
                "createdAt": now,
            },
            {
                "_id": client_id,
                "role": "client",
                "identityId": ObjectId(),
                "origin": "synthetic-seeded",
                "displayName": "C",
                "createdAt": now,
            },
        ]
    )
    mongo_db.engagements.insert_one(
        {
            "_id": engagement_id,
            "freelancerProfileId": freelancer_id,
            "clientProfileId": client_id,
            "status": "active",
            "createdAt": now,
        }
    )
    try:
        dataset = load_dataset(mongo_db)
        assert dataset["outcomes_by_profile"].get(freelancer_id, []) == []
    finally:
        mongo_db.profiles.delete_many({"_id": {"$in": [freelancer_id, client_id]}})
        mongo_db.engagements.delete_one({"_id": engagement_id})
