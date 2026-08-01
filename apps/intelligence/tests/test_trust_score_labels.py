import pytest

from trust_score.labels import (
    ROLE_LABEL_TERMS,
    LabelingUnavailableError,
    compute_label_terms,
    compute_reliability_index,
)


def test_each_role_label_components_use_only_its_own_fixed_terms():
    freelancer = compute_label_terms(
        {"subject_role": 0, "ghost_rate": 0.25, "on_time_rate": 0.8, "scope_creep_rate": 0.0}
    )
    client = compute_label_terms(
        {
            "subject_role": 1,
            "ghost_rate": 0.25,
            "paid_in_full_rate": 0.7,
            "scope_creep_rate": 0.4,
            "on_time_rate": 0.0,
        }
    )

    assert tuple(freelancer) == ROLE_LABEL_TERMS["freelancer"]
    assert freelancer == {"ghost": 0.75, "on_time_delivery": 0.8}
    assert tuple(client) == ROLE_LABEL_TERMS["client"]
    assert client == {"ghost": 0.75, "paid_in_full": 0.7, "revision_restraint": 0.6}


def test_reliability_index_and_buckets_are_unavailable_until_a4():
    with pytest.raises(LabelingUnavailableError, match="A4"):
        compute_reliability_index({"subject_role": 0})
