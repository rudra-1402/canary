from datetime import datetime

from bson import ObjectId

from trust_score.config import TrustScoreConfig
from trust_score.model import train_model
from trust_score.rescore import rescore_profiles


def _feature_row(ghost_rate, on_time_rate):
    return {
        "subject_role": 0,
        "ghost_rate": ghost_rate,
        "completion_rate": 1 - ghost_rate,
        "avg_review_rating": 4.0,
        "observed_engagement_count": 3,
        "on_time_rate": on_time_rate,
        "avg_days_late": 0.0,
        "recency_weighted_on_time_rate": on_time_rate,
        "paid_in_full_rate": float("nan"),
        "scope_creep_rate": float("nan"),
        "trend_slope": 0.0,
    }


def _insert_concluded_outcomes(db, profile_id, count):
    now = datetime(2026, 6, 1)
    other_id = ObjectId()
    for _ in range(count):
        engagement_id = ObjectId()
        db.engagements.insert_one(
            {
                "_id": engagement_id,
                "freelancerProfileId": profile_id,
                "clientProfileId": other_id,
                "status": "concluded",
            }
        )
        db.outcomes.insert_one(
            {
                "_id": ObjectId(),
                "engagementId": engagement_id,
                "subjectProfileId": profile_id,
                "ghosted": False,
                "endedAs": "completed",
                "daysLate": 0,
                "paidInFull": None,
                "scopeCreepOccurred": None,
                "recordedAt": now,
                "observed": True,
            }
        )


def _freelancer_model(config):
    return train_model([_feature_row(0.0, 1.0), _feature_row(1.0, 0.0)], ["high", "low"], config)


def test_rescore_writes_one_scored_snapshot_with_signals_linked_to_it(mongo_db):
    profile_id = ObjectId()
    now = datetime(2026, 6, 2)
    config = TrustScoreConfig(xgb_n_estimators=2, xgb_max_depth=2)
    mongo_db.profiles.insert_one({"_id": profile_id, "role": "freelancer"})
    _insert_concluded_outcomes(mongo_db, profile_id, count=3)
    try:
        results = rescore_profiles(
            mongo_db, [profile_id], {"freelancer": _freelancer_model(config)}, config, now
        )
        assert len(results) == 1
        assert results[0]["status"] == "scored"
        snapshots = list(mongo_db.trustscores.find({"profileId": profile_id}))
        assert len(snapshots) == 1
        signals = list(mongo_db.risksignals.find({"parentId": snapshots[0]["_id"]}))
        assert len(signals) == 2
        assert all(signal["parentId"] == snapshots[0]["_id"] for signal in signals)
    finally:
        mongo_db.risksignals.delete_many({"parentType": "TrustScore"})
        mongo_db.trustscores.delete_many({"profileId": profile_id})
        mongo_db.profiles.delete_one({"_id": profile_id})
        mongo_db.outcomes.delete_many({"subjectProfileId": profile_id})
        mongo_db.engagements.delete_many({"freelancerProfileId": profile_id})


def test_rescore_writes_insufficient_history_without_score(mongo_db):
    profile_id = ObjectId()
    config = TrustScoreConfig(xgb_n_estimators=2, xgb_max_depth=2)
    mongo_db.profiles.insert_one({"_id": profile_id, "role": "freelancer"})
    _insert_concluded_outcomes(mongo_db, profile_id, count=2)
    try:
        rescore_profiles(
            mongo_db,
            [profile_id],
            {"freelancer": _freelancer_model(config)},
            config,
            datetime(2026, 6, 2),
        )
        snapshot = mongo_db.trustscores.find_one({"profileId": profile_id})
        assert snapshot["status"] == "insufficient-history"
        assert "score" not in snapshot
        assert mongo_db.risksignals.count_documents({"parentId": snapshot["_id"]}) == 0
    finally:
        mongo_db.risksignals.delete_many({"parentType": "TrustScore"})
        mongo_db.trustscores.delete_many({"profileId": profile_id})
        mongo_db.profiles.delete_one({"_id": profile_id})
        mongo_db.outcomes.delete_many({"subjectProfileId": profile_id})
        mongo_db.engagements.delete_many({"freelancerProfileId": profile_id})
