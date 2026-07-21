import pytest

from trust_score.labels import INT_TO_LABEL, LABEL_TO_INT, bucket_label, compute_reliability_index


def _features(paid_in_full_rate=1.0, on_time_rate=1.0, ghost_rate=0.0, scope_creep_rate=0.0):
    return {
        "paid_in_full_rate": paid_in_full_rate,
        "on_time_rate": on_time_rate,
        "ghost_rate": ghost_rate,
        "scope_creep_rate": scope_creep_rate,
    }


def test_perfect_history_scores_index_of_one():
    assert compute_reliability_index(_features()) == pytest.approx(1.0)


def test_worst_history_scores_index_of_zero():
    index = compute_reliability_index(
        _features(paid_in_full_rate=0.0, on_time_rate=0.0, ghost_rate=1.0, scope_creep_rate=1.0)
    )
    assert index == 0.0


def test_bucket_label_thresholds():
    assert bucket_label(0.9) == "high"
    assert bucket_label(0.75) == "high"
    assert bucket_label(0.6) == "med"
    assert bucket_label(0.5) == "med"
    assert bucket_label(0.3) == "low"


def test_label_int_mapping_is_a_bijection():
    assert set(LABEL_TO_INT.keys()) == {"low", "med", "high"}
    assert set(LABEL_TO_INT.values()) == {0, 1, 2}
    for label, i in LABEL_TO_INT.items():
        assert INT_TO_LABEL[i] == label
