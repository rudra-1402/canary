from datetime import datetime, timedelta

import pytest
from bson import ObjectId

from generator.config import GeneratorConfig
from generator.identities_profiles import SEED_DEV_PASSWORD_HASH, generate_identities_and_profiles
from generator.reviews import generate_reviews
from generator.run import COLLECTIONS, PERSISTENCE_VALIDATION_COLLECTIONS, _resolve_ids


class _InsertResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class _FakeCollection:
    def __init__(self):
        self.documents = []

    def insert_one(self, document):
        stored = dict(document)
        stored.setdefault("_id", ObjectId())
        self.documents.append(stored)
        return _InsertResult(stored["_id"])


class _FakeDatabase:
    def __init__(self):
        for collection_name in (
            "identities",
            "profiles",
            "jobposts",
            "proposals",
            "engagements",
            "outcomes",
            "reviews",
            "payments",
        ):
            setattr(self, collection_name, _FakeCollection())


def _resolve_fixture():
    created_at = datetime(2026, 1, 1)
    concluded_at = created_at + timedelta(days=21)
    identities = [
        {
            "_localId": "identity-freelancer",
            "email": "freelancer@example.test",
            "passwordHash": SEED_DEV_PASSWORD_HASH,
            "emailVerified": True,
            "activeProfileLocalId": "profile-freelancer",
            "createdAt": created_at,
        },
        {
            "_localId": "identity-client",
            "email": "client@example.test",
            "passwordHash": SEED_DEV_PASSWORD_HASH,
            "emailVerified": True,
            "activeProfileLocalId": "profile-client",
            "createdAt": created_at,
        },
    ]
    profiles = [
        {
            "_localId": "profile-freelancer",
            "identityLocalId": "identity-freelancer",
            "role": "freelancer",
            "origin": "synthetic-seeded",
            "displayName": "Freelancer",
            "createdAt": created_at,
        },
        {
            "_localId": "profile-client",
            "identityLocalId": "identity-client",
            "role": "client",
            "origin": "synthetic-seeded",
            "displayName": "Client",
            "createdAt": created_at,
        },
    ]
    jobposts = [
        {
            "_localId": "jobpost-1",
            "clientProfileLocalId": "profile-client",
            "title": "Build Canary",
            "category": "web-development",
            "description": "Build the Canary marketplace.",
            "skills": ["python"],
            "jobType": "fixed",
            "budgetOrRate": 1000,
            "experienceLevel": "intermediate",
            "projectLength": "1-to-3-months",
            "status": "closed",
            "createdAt": created_at,
        }
    ]
    proposals = [
        {
            "_localId": "proposal-1",
            "jobPostLocalId": "jobpost-1",
            "freelancerProfileLocalId": "profile-freelancer",
            "bid": 1000,
            "payModel": "project",
            "proposedDurationDays": 14,
            "status": "accepted",
            "createdAt": created_at,
        }
    ]
    engagements = [
        {
            "_localId": "engagement-1",
            "freelancerProfileLocalId": "profile-freelancer",
            "clientProfileLocalId": "profile-client",
            "jobPostLocalId": "jobpost-1",
            "proposalLocalId": "proposal-1",
            "status": "concluded",
            "agreedTerms": {
                "scope": "Build Canary",
                "price": 1000,
                "paymentTerms": "net-30",
                "timeline": "2 weeks",
                "dueAt": created_at + timedelta(days=14),
                "revisionsIncluded": 1,
            },
            "createdAt": created_at,
        }
    ]
    outcomes = [
        {
            "engagementLocalId": "engagement-1",
            "subjectProfileLocalId": "profile-freelancer",
            "counterpartyProfileLocalId": "profile-client",
            "subjectRole": "freelancer",
            "observed": True,
            "deliveredAt": concluded_at - timedelta(days=1),
            "daysLate": -1,
            "paidInFull": None,
            "revisionsRequested": None,
            "scopeCreepOccurred": None,
            "ghosted": False,
            "endedAs": "completed",
            "labelSource": "synthetic",
            "recordedAt": concluded_at,
        },
        {
            "engagementLocalId": "engagement-1",
            "subjectProfileLocalId": "profile-client",
            "counterpartyProfileLocalId": "profile-freelancer",
            "subjectRole": "client",
            "observed": True,
            "deliveredAt": None,
            "daysLate": None,
            "paidInFull": True,
            "revisionsRequested": 1,
            "scopeCreepOccurred": False,
            "ghosted": False,
            "endedAs": "completed",
            "labelSource": "synthetic",
            "recordedAt": concluded_at,
        },
    ]
    reviews = [
        {
            "_localId": "review-1",
            "engagementLocalId": "engagement-1",
            "authorProfileLocalId": "profile-client",
            "subjectProfileLocalId": "profile-freelancer",
            "rating": 2,
            "text": "Unfairly negative.",
            "isPlantedCollusion": False,
            "isPlantedSabotage": True,
            "createdAt": concluded_at + timedelta(days=1),
            "visibleAt": concluded_at + timedelta(days=15),
        }
    ]
    return identities, profiles, jobposts, proposals, engagements, outcomes, reviews


def test_resolve_ids_persists_two_mapped_outcomes_with_per_party_semantics_and_review_provenance():
    db = _FakeDatabase()
    identities, profiles, jobposts, proposals, engagements, outcomes, reviews = _resolve_fixture()

    _resolve_ids(db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, [])

    assert len(db.outcomes.documents) == 2
    engagement = db.engagements.documents[0]
    freelancer_id = engagement["freelancerProfileId"]
    client_id = engagement["clientProfileId"]
    outcomes_by_subject = {outcome["subjectProfileId"]: outcome for outcome in db.outcomes.documents}
    freelancer_outcome = outcomes_by_subject[freelancer_id]
    client_outcome = outcomes_by_subject[client_id]

    for outcome in db.outcomes.documents:
        assert outcome["engagementId"] == engagement["_id"]
        assert isinstance(outcome["subjectProfileId"], ObjectId)
        assert isinstance(outcome["counterpartyProfileId"], ObjectId)
        assert outcome["recordedAt"] == outcomes[0]["recordedAt"]
        assert outcome["createdAt"] == outcomes[0]["recordedAt"]

    assert freelancer_outcome["counterpartyProfileId"] == client_id
    assert freelancer_outcome["subjectRole"] == "freelancer"
    assert freelancer_outcome["observed"] is True
    assert freelancer_outcome["deliveredAt"] == outcomes[0]["deliveredAt"]
    assert freelancer_outcome["daysLate"] == -1
    assert freelancer_outcome["paidInFull"] is None
    assert freelancer_outcome["revisionsRequested"] is None
    assert freelancer_outcome["scopeCreepOccurred"] is None

    assert client_outcome["counterpartyProfileId"] == freelancer_id
    assert client_outcome["subjectRole"] == "client"
    assert client_outcome["observed"] is True
    assert client_outcome["deliveredAt"] is None
    assert client_outcome["daysLate"] is None
    assert client_outcome["paidInFull"] is True
    assert client_outcome["revisionsRequested"] == 1
    assert client_outcome["scopeCreepOccurred"] is False

    assert len(db.reviews.documents) == 1
    review = db.reviews.documents[0]
    assert review["isPlantedCollusion"] is False
    assert review["isPlantedSabotage"] is True


def test_resolve_ids_maps_seeded_identity_active_profiles_to_profiles_they_own():
    db = _FakeDatabase()
    identities, profiles = generate_identities_and_profiles(GeneratorConfig(seed=42, num_profiles=20))

    _resolve_ids(db, identities, profiles, [], [], [], [], [], [])

    profiles_by_id = {profile["_id"]: profile for profile in db.profiles.documents}
    for identity in db.identities.documents:
        active_profile = profiles_by_id[identity["activeProfileId"]]
        assert active_profile["identityId"] == identity["_id"]


def test_reviews_are_timestamped_after_conclusion_and_visible_before_the_run_now():
    conclusion_at = datetime(2026, 1, 21)
    now = conclusion_at + timedelta(days=30)
    profiles = [
        {"_localId": "profile-freelancer", "trueArchetype": "reliable"},
        {"_localId": "profile-client", "trueArchetype": "reliable"},
    ]
    engagements = [
        {
            "_localId": f"engagement-{index}",
            "freelancerProfileLocalId": "profile-freelancer",
            "clientProfileLocalId": "profile-client",
            "createdAt": conclusion_at - timedelta(days=30),
        }
        for index in range(20)
    ]
    outcomes = [
        {
            "engagementLocalId": engagement["_localId"],
            "subjectProfileLocalId": subject_id,
            "subjectRole": role,
            "observed": True,
            "ghosted": False,
            "daysLate": 0 if role == "freelancer" else None,
            "paidInFull": True if role == "client" else None,
            "scopeCreepOccurred": False if role == "client" else None,
        }
        for engagement in engagements
        for subject_id, role in (
            ("profile-freelancer", "freelancer"),
            ("profile-client", "client"),
        )
    ]
    timelines = {engagement["_localId"]: {"recordedAt": conclusion_at} for engagement in engagements}

    reviews = generate_reviews(
        GeneratorConfig(seed=42), profiles, engagements, outcomes, [], timelines=timelines, now=now
    )

    assert reviews
    assert all(review["createdAt"] > conclusion_at for review in reviews)
    assert all(review["createdAt"] <= now for review in reviews)
    assert all(review["visibleAt"] is not None and review["visibleAt"] <= now for review in reviews)
    assert all(
        review["createdAt"]
        != next(
            engagement["createdAt"]
            for engagement in engagements
            if engagement["_localId"] == review["engagementLocalId"]
        )
        for review in reviews
    )

    reviews_by_engagement = {}
    for review in reviews:
        reviews_by_engagement.setdefault(review["engagementLocalId"], []).append(review)
    for engagement_reviews in reviews_by_engagement.values():
        if len(engagement_reviews) == 2:
            assert {review["visibleAt"] for review in engagement_reviews} == {
                max(review["createdAt"] for review in engagement_reviews)
            }
        else:
            review = engagement_reviews[0]
            assert review["visibleAt"] == review["createdAt"] + timedelta(days=14)


def test_resolve_ids_persists_review_timestamps_instead_of_the_engagement_creation_time():
    db = _FakeDatabase()
    identities, profiles, jobposts, proposals, engagements, outcomes, reviews = _resolve_fixture()
    review_created_at = outcomes[0]["recordedAt"] + timedelta(days=2)
    reviews[0].update(createdAt=review_created_at, visibleAt=review_created_at + timedelta(days=14))

    _resolve_ids(db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, [])

    review = db.reviews.documents[0]
    assert review["createdAt"] == review_created_at
    assert review["createdAt"] != db.engagements.documents[0]["createdAt"]
    assert review["visibleAt"] == review_created_at + timedelta(days=14)


def test_validate_persistence_rejects_missing_outcome_subject_before_insertion():
    db = _FakeDatabase()
    identities, profiles, jobposts, proposals, engagements, outcomes, reviews = _resolve_fixture()
    del outcomes[0]["subjectProfileLocalId"]

    with pytest.raises(ValueError, match="subjectProfileId"):
        _resolve_ids(db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, [])

    assert all(not getattr(db, collection_name).documents for collection_name in COLLECTIONS)


def test_validate_persistence_rejects_review_subject_outside_the_engagement_before_insertion():
    db = _FakeDatabase()
    identities, profiles, jobposts, proposals, engagements, outcomes, reviews = _resolve_fixture()
    identities.append(
        {
            "_localId": "identity-outsider",
            "email": "outsider@example.test",
            "passwordHash": SEED_DEV_PASSWORD_HASH,
            "emailVerified": True,
            "activeProfileLocalId": "profile-outsider",
            "createdAt": datetime(2026, 1, 1),
        }
    )
    profiles.append(
        {
            "_localId": "profile-outsider",
            "identityLocalId": "identity-outsider",
            "role": "freelancer",
            "origin": "synthetic-seeded",
            "displayName": "Outsider",
            "createdAt": datetime(2026, 1, 1),
        }
    )
    reviews[0]["subjectProfileLocalId"] = "profile-outsider"

    with pytest.raises(ValueError, match="subjectProfileId"):
        _resolve_ids(db, identities, profiles, jobposts, proposals, engagements, outcomes, reviews, [])

    assert all(not getattr(db, collection_name).documents for collection_name in COLLECTIONS)


def test_validate_persistence_covers_every_written_collection():
    assert PERSISTENCE_VALIDATION_COLLECTIONS == COLLECTIONS
