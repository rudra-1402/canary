from datetime import datetime

import pytest
from bson import ObjectId

from trust_score.run import prepare_output_collections


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
