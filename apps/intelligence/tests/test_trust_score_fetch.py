from datetime import datetime

from bson import ObjectId

from trust_score.fetch import load_dataset, load_profile_dataset


def test_load_dataset_indexes_outcomes_by_subject_and_reviews_by_subject(mongo_db):
    freelancer_id = ObjectId()
    client_id = ObjectId()
    engagement_id = ObjectId()
    freelancer_outcome_id = ObjectId()
    client_outcome_id = ObjectId()
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
    mongo_db.outcomes.insert_many(
        [
            {
                "_id": freelancer_outcome_id,
                "engagementId": engagement_id,
                "subjectProfileId": freelancer_id,
                "paidInFull": None,
                "daysLate": 0,
                "scopeCreepOccurred": None,
                "ghosted": False,
                "endedAs": "completed",
                "labelSource": "synthetic",
                "recordedAt": now,
                "createdAt": now,
            },
            {
                "_id": client_outcome_id,
                "engagementId": engagement_id,
                "subjectProfileId": client_id,
                "paidInFull": True,
                "daysLate": None,
                "scopeCreepOccurred": False,
                "ghosted": False,
                "endedAs": "completed",
                "labelSource": "synthetic",
                "recordedAt": now,
                "createdAt": now,
            },
        ]
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
        freelancer_outcomes = dataset["outcomes_by_profile"].get(freelancer_id, [])
        client_outcomes = dataset["outcomes_by_profile"].get(client_id, [])
        assert [o["_id"] for o in freelancer_outcomes] == [freelancer_outcome_id]
        assert [o["_id"] for o in client_outcomes] == [client_outcome_id]
        assert freelancer_outcomes[0]["subjectProfileId"] == freelancer_id
        assert client_outcomes[0]["subjectProfileId"] == client_id
        assert len(dataset["reviews_by_subject"].get(client_id, [])) == 1
        assert len(dataset["reviews_by_subject"].get(freelancer_id, [])) == 0
        profile_ids = {p["_id"] for p in dataset["profiles"]}
        assert {freelancer_id, client_id} <= profile_ids
    finally:
        mongo_db.profiles.delete_many({"_id": {"$in": [freelancer_id, client_id]}})
        mongo_db.engagements.delete_one({"_id": engagement_id})
        mongo_db.outcomes.delete_many({"_id": {"$in": [freelancer_outcome_id, client_outcome_id]}})
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


def test_load_dataset_attaches_an_unrelated_subject_outcome_to_no_party(mongo_db):
    freelancer_id, client_id, unrelated_id, engagement_id = ObjectId(), ObjectId(), ObjectId(), ObjectId()
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
            {
                "_id": unrelated_id,
                "role": "freelancer",
                "identityId": ObjectId(),
                "origin": "synthetic-seeded",
                "displayName": "U",
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
            "createdAt": now,
        }
    )
    mongo_db.outcomes.insert_one(
        {
            "_id": outcome_id,
            "engagementId": engagement_id,
            "subjectProfileId": unrelated_id,
            "recordedAt": now,
        }
    )
    try:
        dataset = load_dataset(mongo_db)
        assert dataset["outcomes_by_profile"].get(freelancer_id, []) == []
        assert dataset["outcomes_by_profile"].get(client_id, []) == []
        assert dataset["outcomes_by_profile"].get(unrelated_id, []) == []
    finally:
        mongo_db.profiles.delete_many({"_id": {"$in": [freelancer_id, client_id, unrelated_id]}})
        mongo_db.engagements.delete_one({"_id": engagement_id})
        mongo_db.outcomes.delete_one({"_id": outcome_id})


def test_load_profile_dataset_matches_bulk_dataset_for_one_profile(mongo_db):
    freelancer_id, client_id, engagement_id = ObjectId(), ObjectId(), ObjectId()
    mongo_db.profiles.insert_many(
        [{"_id": freelancer_id, "role": "freelancer"}, {"_id": client_id, "role": "client"}]
    )
    mongo_db.engagements.insert_one(
        {
            "_id": engagement_id,
            "freelancerProfileId": freelancer_id,
            "clientProfileId": client_id,
            "status": "concluded",
        }
    )
    mongo_db.outcomes.insert_many(
        [
            {"_id": ObjectId(), "engagementId": engagement_id, "subjectProfileId": freelancer_id},
            {"_id": ObjectId(), "engagementId": engagement_id, "subjectProfileId": client_id},
        ]
    )
    mongo_db.reviews.insert_one({"_id": ObjectId(), "subjectProfileId": freelancer_id, "rating": 5})
    try:
        bulk = load_dataset(mongo_db)
        targeted = load_profile_dataset(mongo_db, freelancer_id)
        assert targeted["profile"] == next(p for p in bulk["profiles"] if p["_id"] == freelancer_id)
        assert targeted["outcomes"] == bulk["outcomes_by_profile"][freelancer_id]
        assert targeted["reviews"] == bulk["reviews_by_subject"][freelancer_id]
    finally:
        mongo_db.profiles.delete_many({"_id": {"$in": [freelancer_id, client_id]}})
        mongo_db.engagements.delete_one({"_id": engagement_id})
        mongo_db.outcomes.delete_many({"engagementId": engagement_id})
        mongo_db.reviews.delete_many({"subjectProfileId": freelancer_id})
