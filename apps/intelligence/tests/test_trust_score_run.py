from datetime import datetime

import pytest
from bson import ObjectId

from trust_score import run
from trust_score.config import TrustScoreConfig
from trust_score.model import train_model
from trust_score.run import (
    prepare_output_collections,
    score_current_profiles,
)


def _snapshot_row(profile_id):
    return {
        "profileId": profile_id,
        "status": "scored",
        "score": 70,
        "level": "med",
        "generatedAt": datetime(2026, 6, 1),
        "createdAt": datetime(2026, 6, 1),
    }


def _signal_row(parent_id, parent_type="TrustScore"):
    return {
        "parentType": parent_type,
        "parentId": parent_id,
        "name": "on-time-rate",
        "value": 0.2,
        "direction": "favorable",
        "source": "structured-data",
        "sourceBriefAnalysisId": None,
        "createdAt": datetime(2026, 6, 1),
    }


@pytest.fixture
def seeded_outputs(mongo_db):
    """Two TrustScore rows with a signal each, plus one RiskAssessment-parented
    signal that the wipe must not touch."""
    ids = [mongo_db.trustscores.insert_one(_snapshot_row(ObjectId())).inserted_id for _ in range(2)]
    for trust_score_id in ids:
        mongo_db.risksignals.insert_one(_signal_row(trust_score_id))
    foreign_id = mongo_db.risksignals.insert_one(
        _signal_row(ObjectId(), parent_type="RiskAssessment")
    ).inserted_id
    yield {"trust_score_ids": ids, "foreign_signal_id": foreign_id}
    mongo_db.trustscores.delete_many({"_id": {"$in": ids}})
    mongo_db.risksignals.delete_many({"parentId": {"$in": ids}})
    mongo_db.risksignals.delete_one({"_id": foreign_id})


def test_refuses_to_run_against_non_empty_output_without_wipe(mongo_db, seeded_outputs):
    with pytest.raises(SystemExit):
        prepare_output_collections(mongo_db, wipe=False)


def test_refusal_leaves_the_data_untouched(mongo_db, seeded_outputs):
    """A guard that aborts after deleting is worse than no guard."""
    before_scores = mongo_db.trustscores.count_documents({})
    before_signals = mongo_db.risksignals.count_documents({})
    with pytest.raises(SystemExit):
        prepare_output_collections(mongo_db, wipe=False)
    assert mongo_db.trustscores.count_documents({}) == before_scores
    assert mongo_db.risksignals.count_documents({}) == before_signals


def test_wipe_clears_trust_scores_and_their_signals(mongo_db, seeded_outputs):
    prepare_output_collections(mongo_db, wipe=True)
    assert mongo_db.trustscores.count_documents({}) == 0
    assert mongo_db.risksignals.count_documents({"parentType": "TrustScore"}) == 0


def test_wipe_spares_risk_signals_belonging_to_a_risk_assessment(mongo_db, seeded_outputs):
    """risksignals is shared with RiskAssessment (S5-C computes those). Deleting the
    whole collection would be a data-loss bug the moment that lands."""
    prepare_output_collections(mongo_db, wipe=True)
    assert mongo_db.risksignals.find_one({"_id": seeded_outputs["foreign_signal_id"]}) is not None


def test_empty_output_collections_need_no_wipe_flag(mongo_db):
    mongo_db.trustscores.delete_many({})
    prepare_output_collections(mongo_db, wipe=False)


def test_feature_preparation_only_mode_emits_one_superset_row_per_profile(monkeypatch):
    freelancer_id, client_id = ObjectId(), ObjectId()
    dataset = {
        "profiles": [
            {"_id": freelancer_id, "role": "freelancer"},
            {"_id": client_id, "role": "client"},
        ],
        "outcomes_by_profile": {
            freelancer_id: [
                {
                    "recordedAt": datetime(2026, 6, 1),
                    "observed": True,
                    "ghosted": False,
                    "daysLate": 0,
                    "paidInFull": None,
                    "scopeCreepOccurred": None,
                    "endedAs": "completed",
                }
            ],
            client_id: [
                {
                    "recordedAt": datetime(2026, 6, 1),
                    "observed": True,
                    "ghosted": False,
                    "daysLate": None,
                    "paidInFull": True,
                    "scopeCreepOccurred": False,
                    "endedAs": "completed",
                }
            ],
        },
        "reviews_by_subject": {freelancer_id: [], client_id: []},
    }

    class _Client:
        def get_default_database(self):
            return object()

    monkeypatch.setattr(run, "get_client", _Client)
    monkeypatch.setattr(run, "close_client", lambda client: None)
    monkeypatch.setattr(run, "load_dataset", lambda db: dataset)

    rows = run.main(["--prepare-features-only"])

    assert [row["features"]["subject_role"] for row in rows] == [0, 1]
    assert len(rows[0]["features"]) == len(rows[1]["features"])


def _delivery_outcome(day, days_late):
    return {
        "recordedAt": datetime(2026, 6, day),
        "observed": True,
        "ghosted": False,
        "daysLate": days_late,
        "paidInFull": None,
        "scopeCreepOccurred": None,
        "endedAs": "completed",
    }


def test_score_current_profiles_attaches_real_risk_signals_to_a_scored_snapshot():
    """Part B.0 regression guard: a scored snapshot must never carry riskSignals=[]
    -- that is exactly what made trustScore.service.js throw for every real score."""
    freelancer_id, client_id = ObjectId(), ObjectId()
    config = TrustScoreConfig(seed=42, xgb_n_estimators=5, xgb_max_depth=2)
    dataset = {
        "profiles": [
            {"_id": freelancer_id, "role": "freelancer"},
            {"_id": client_id, "role": "client"},
        ],
        "outcomes_by_profile": {
            freelancer_id: [_delivery_outcome(day, days_late=0) for day in range(1, 4)],
            client_id: [_delivery_outcome(1, days_late=None)],
        },
        "reviews_by_subject": {freelancer_id: [], client_id: []},
    }
    freelancer_model = train_model(
        [
            {
                "subject_role": 0,
                "ghost_rate": 0.0,
                "completion_rate": 1.0,
                "avg_review_rating": 3.0,
                "observed_engagement_count": 3,
                "on_time_rate": 1.0,
                "avg_days_late": 0.0,
                "recency_weighted_on_time_rate": 1.0,
                "paid_in_full_rate": float("nan"),
                "scope_creep_rate": float("nan"),
                "trend_slope": 0.0,
            },
            {
                "subject_role": 0,
                "ghost_rate": 0.6,
                "completion_rate": 0.4,
                "avg_review_rating": 2.0,
                "observed_engagement_count": 3,
                "on_time_rate": 0.1,
                "avg_days_late": 5.0,
                "recency_weighted_on_time_rate": 0.1,
                "paid_in_full_rate": float("nan"),
                "scope_creep_rate": float("nan"),
                "trend_slope": 0.0,
            },
        ],
        ["high", "low"],
        config,
    )

    snapshots = score_current_profiles(
        dataset, {"freelancer": freelancer_model}, config, datetime(2026, 6, 10)
    )

    by_id = {snapshot["profile_id"]: snapshot for snapshot in snapshots}
    scored = by_id[freelancer_id]
    assert scored["status"] == "scored"
    assert scored["riskSignals"], "a scored snapshot must never carry an empty risk signal list"
    assert {signal["name"] for signal in scored["riskSignals"]} == {"ghost-rate", "on-time-rate"}
    for signal in scored["riskSignals"]:
        assert signal["source"] == "structured-data"

    cold_start = by_id[client_id]
    assert cold_start["status"] == "insufficient-history"
    assert cold_start["riskSignals"] == []
