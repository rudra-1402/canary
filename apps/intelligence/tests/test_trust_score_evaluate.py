from datetime import datetime

import pytest
from bson import ObjectId

from trust_score.config import TrustScoreConfig
from trust_score.evaluate import ModelExecutionUnavailableError, evaluate_role, prepare_role_feature_rows

NOW = datetime(2026, 7, 1)


def test_evaluate_preparation_passes_profile_role_to_feature_contract():
    profile_id = ObjectId()
    dataset = {
        "profiles": [{"_id": profile_id, "role": "client"}],
        "outcomes_by_profile": {
            profile_id: [
                {
                    "recordedAt": datetime(2026, 6, 1),
                    "observed": True,
                    "ghosted": False,
                    "daysLate": None,
                    "paidInFull": True,
                    "scopeCreepOccurred": False,
                    "endedAs": "completed",
                }
            ]
        },
        "reviews_by_subject": {profile_id: []},
    }

    rows = prepare_role_feature_rows(
        dataset, "client", TrustScoreConfig(min_engagements_for_scoring=1), now=NOW
    )

    assert rows[0]["features"]["subject_role"] == 1
    assert rows[0]["label_terms"] == {"ghost": 1.0, "paid_in_full": 1.0, "revision_restraint": 1.0}


def test_evaluate_role_fails_loudly_until_a4_defines_labels():
    with pytest.raises(ModelExecutionUnavailableError, match="A4"):
        evaluate_role(None, "freelancer", TrustScoreConfig(), {}, {}, now=NOW)
