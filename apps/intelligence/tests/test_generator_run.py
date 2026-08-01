from datetime import datetime, timedelta

from bson import ObjectId

from generator.run import _resolve_ids


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
        {"_localId": "identity-freelancer", "email": "freelancer@example.test", "createdAt": created_at},
        {"_localId": "identity-client", "email": "client@example.test", "createdAt": created_at},
    ]
    profiles = [
        {
            "_localId": "profile-freelancer",
            "identityLocalId": "identity-freelancer",
            "role": "freelancer",
            "createdAt": created_at,
        },
        {
            "_localId": "profile-client",
            "identityLocalId": "identity-client",
            "role": "client",
            "createdAt": created_at,
        },
    ]
    jobposts = [
        {
            "_localId": "jobpost-1",
            "clientProfileLocalId": "profile-client",
            "title": "Build Canary",
            "createdAt": created_at,
        }
    ]
    proposals = [
        {
            "_localId": "proposal-1",
            "jobPostLocalId": "jobpost-1",
            "freelancerProfileLocalId": "profile-freelancer",
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
            "agreedTerms": {"scope": "Build Canary"},
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
