from datetime import datetime

import pytest
from bson import ObjectId

from trust_score.persistence import persist_trust_score


def test_persist_trust_score_writes_trust_score_and_linked_risk_signals(mongo_db):
    profile_id = ObjectId()
    generated_at = datetime(2026, 6, 1)
    snapshot = {
        "generatedAt": generated_at,
        "status": "scored",
        "score": 82,
        "level": "high",
        "riskSignals": [
            {
                "name": "on-time-rate",
                "value": 0.31,
                "direction": "favorable",
                "source": "structured-data",
            },
            {
                "name": "ghost-rate",
                "value": -0.12,
                "direction": "unfavorable",
                "source": "structured-data",
            },
        ],
    }

    trust_score_id = None
    try:
        trust_score_id = persist_trust_score(mongo_db, profile_id, snapshot)

        stored_score = mongo_db.trustscores.find_one({"_id": trust_score_id})
        assert stored_score["profileId"] == profile_id
        assert stored_score["status"] == "scored"
        assert stored_score["score"] == 82
        assert stored_score["level"] == "high"
        assert stored_score["generatedAt"] == generated_at
        assert stored_score["createdAt"] == generated_at

        stored_signals = list(mongo_db.risksignals.find({"parentId": trust_score_id}))
        assert len(stored_signals) == 2
        assert {signal["name"] for signal in stored_signals} == {
            "on-time-rate",
            "ghost-rate",
        }
        for signal in stored_signals:
            assert signal["parentType"] == "TrustScore"
            assert signal["source"] == "structured-data"
            assert signal["sourceBriefAnalysisId"] is None
    finally:
        mongo_db.risksignals.delete_many({"parentId": trust_score_id})
        if trust_score_id:
            mongo_db.trustscores.delete_one({"_id": trust_score_id})


def test_persist_trust_score_writes_no_score_and_no_signals_when_insufficient_history(mongo_db):
    """Asserted against the raw pymongo document, because that is the exact artifact
    the Node side validates -- the writer bypasses Mongoose entirely."""
    profile_id = ObjectId()
    generated_at = datetime(2026, 6, 1)
    snapshot = {
        "generatedAt": generated_at,
        "status": "insufficient-history",
        "riskSignals": [],
    }

    trust_score_id = None
    try:
        trust_score_id = persist_trust_score(mongo_db, profile_id, snapshot)

        stored_score = mongo_db.trustscores.find_one({"_id": trust_score_id})
        assert stored_score["profileId"] == profile_id
        assert stored_score["status"] == "insufficient-history"
        assert "score" not in stored_score
        assert "level" not in stored_score
        assert stored_score["generatedAt"] == generated_at
        assert stored_score["createdAt"] == generated_at

        assert mongo_db.risksignals.count_documents({"parentId": trust_score_id}) == 0
    finally:
        mongo_db.risksignals.delete_many({"parentId": trust_score_id})
        if trust_score_id:
            mongo_db.trustscores.delete_one({"_id": trust_score_id})


def test_persist_trust_score_removes_snapshot_if_a_signal_write_fails(mongo_db):
    profile_id = ObjectId()
    previous_id = mongo_db.trustscores.insert_one(
        {
            "profileId": profile_id,
            "status": "scored",
            "score": 70,
            "level": "med",
            "generatedAt": datetime(2026, 5, 1),
            "createdAt": datetime(2026, 5, 1),
        }
    ).inserted_id
    snapshot = {
        "generatedAt": datetime(2026, 6, 1),
        "status": "scored",
        "score": 82,
        "level": "high",
        "riskSignals": [
            {"name": "ghost-rate", "value": 0.1, "direction": "favorable", "source": "structured-data"}
        ],
    }

    class _FailingRiskSignals:
        def insert_one(self, document):
            raise RuntimeError("signal failed")

        def delete_many(self, query):
            return mongo_db.risksignals.delete_many(query)

    class _Database:
        trustscores = mongo_db.trustscores
        risksignals = _FailingRiskSignals()

    try:
        with pytest.raises(RuntimeError, match="signal failed"):
            persist_trust_score(_Database(), profile_id, snapshot)

        surviving = list(mongo_db.trustscores.find({"profileId": profile_id}))
        assert [score["_id"] for score in surviving] == [previous_id]
    finally:
        mongo_db.risksignals.delete_many({"parentId": previous_id})
        mongo_db.trustscores.delete_one({"_id": previous_id})
