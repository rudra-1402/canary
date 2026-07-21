from datetime import datetime

from bson import ObjectId

from trust_score.persistence import persist_trust_score


def test_persist_trust_score_writes_trust_score_and_linked_risk_signals(mongo_db):
    profile_id = ObjectId()
    generated_at = datetime(2026, 6, 1)
    snapshot = {
        "generatedAt": generated_at,
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
