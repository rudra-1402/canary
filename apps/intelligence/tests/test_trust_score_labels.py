from trust_score.labels import (
    ROLE_LABEL_TERMS,
    LabelDegeneracyError,
    LabelThresholds,
    assert_label_distribution,
    bucket_label,
    compute_label_terms,
    compute_reliability_index,
    derive_bucket_thresholds,
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


def test_equal_weighting_is_applied_without_fitting_label_weights():
    features = {"subject_role": 0, "ghost_rate": 0.0, "on_time_rate": 0.5}
    assert compute_reliability_index(features) == 0.75


def test_bucket_thresholds_are_derived_from_label_distribution_not_hardcoded():
    thresholds = derive_bucket_thresholds([0.0, 0.1, 0.2, 0.8, 0.9, 1.0])
    assert thresholds != LabelThresholds(0.33, 0.67)
    assert bucket_label(0.0, thresholds) == "low"
    assert bucket_label(1.0, thresholds) == "high"


def test_label_distribution_refuses_to_force_a_degenerate_label_through_gate_4b():
    try:
        assert_label_distribution([1.0] * 20)
    except LabelDegeneracyError as error:
        assert "Gate 4b" in str(error)
    else:
        raise AssertionError("expected degenerate labels to fail Gate 4b")
