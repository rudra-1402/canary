"""Characterize the API-to-feature cross-language Outcome contract.

These tests do not execute JavaScript, so they cannot fail before the JS change; they
pin the Python side of the contract once a row has been persisted.
"""

from datetime import datetime

import pytest
from bson import ObjectId

from generator.run import _validate_structural_document
from trust_score.config import TrustScoreConfig
from trust_score.features import compute_features

AS_OF = datetime(2026, 8, 5, 12, 0, 0)


def _counterparty_reported_ghosting_row(*, observed):
    """Return the API's persisted shape for a client reported as ghosting."""
    return {
        "engagementId": ObjectId(),
        "subjectProfileId": ObjectId(),
        "counterpartyProfileId": ObjectId(),
        "subjectRole": "client",
        "observed": observed,
        "deliveredAt": None,
        "paidInFull": None,
        "daysLate": None,
        "revisionsRequested": None,
        "scopeCreepOccurred": None,
        "ghosted": True,
        "endedAs": "ghosted",
        "labelSource": "counterparty-reported",
        "recordedAt": AS_OF,
        "createdAt": AS_OF,
    }


def test_observed_counterparty_reported_ghosting_row_increases_its_subject_ghost_rate():
    row = _counterparty_reported_ghosting_row(observed=True)

    features = compute_features([row], [], "client", AS_OF, TrustScoreConfig())

    assert features["observed_engagement_count"] == 1
    assert features["ghost_rate"] > 0.0


def test_unobserved_counterparty_reported_ghosting_row_is_discarded_from_its_subject_ghost_rate():
    row = _counterparty_reported_ghosting_row(observed=False)

    features = compute_features([row], [], "client", AS_OF, TrustScoreConfig())

    assert features["observed_engagement_count"] == 0
    assert features["ghost_rate"] == 0.0


@pytest.mark.parametrize("label_source", ["synthetic", "counterparty-reported"])
def test_generator_validation_accepts_counterparty_reported_label_source_alongside_synthetic(label_source):
    row = _counterparty_reported_ghosting_row(observed=True)
    row["labelSource"] = label_source

    _validate_structural_document("outcomes", row, 0)
