from trust_score.config import TrustScoreConfig
from trust_score.learnability import (
    LearnabilityError,
    assert_role_learnability,
    passes_learnability_condition,
)

# A.3's condition, tested directly with synthetic numbers: no model training, no
# database. See test_assert_role_learnability_* below for the wiring that actually
# trains models.


def test_condition_passes_when_real_beats_every_control_by_the_margin():
    assert passes_learnability_condition(0.5, [0.0, 0.1, 0.05, -0.1, 0.2]) is True


def test_condition_fails_when_real_is_within_the_margin_of_a_control():
    # max(permuted) + 0.10 = 0.20; real=0.15 does not clear it.
    assert passes_learnability_condition(0.15, [0.1, 0.1, 0.1, 0.1, 0.1]) is False


def test_condition_requires_real_spearman_strictly_positive_even_with_margin_clear():
    # real beats every control by more than the margin, but is itself non-positive.
    assert passes_learnability_condition(-0.1, [-0.5, -0.5, -0.5, -0.5, -0.5]) is False


def test_condition_passes_with_a_small_positive_real_against_negative_controls():
    # real=0.05 is positive and clears max(permuted) + 0.10 = -0.4.
    assert passes_learnability_condition(0.05, [-0.5] * 5) is True


def _freelancer_examples(count: int) -> list[dict]:
    """Features where on_time_rate tracks the label directly: a real model should
    separate these easily, while a label-permuted control should not."""
    examples = []
    for index in range(count):
        x = index / count
        examples.append(
            {
                "features": {
                    "subject_role": 0,
                    "ghost_rate": 1 - x,
                    "completion_rate": 0.9,
                    "avg_review_rating": 4.0,
                    "observed_engagement_count": 10,
                    "on_time_rate": x,
                    "avg_days_late": 0.0,
                    "recency_weighted_on_time_rate": x,
                    "paid_in_full_rate": float("nan"),
                    "scope_creep_rate": float("nan"),
                    "trend_slope": 0.0,
                },
                "label_value": x,
            }
        )
    return examples


def _tiny_config():
    return TrustScoreConfig(seed=42, xgb_n_estimators=15, xgb_max_depth=3, eval_test_size=0.3)


def test_assert_role_learnability_passes_for_a_genuinely_learnable_label():
    examples = _freelancer_examples(80)
    result = assert_role_learnability("freelancer", examples, _tiny_config())
    assert result.real_spearman > 0
    assert result.real_spearman >= max(result.permuted_spearman) + 0.10


def test_assert_role_learnability_refuses_a_label_uncorrelated_with_features():
    # Same features every time; label assigned independent of them. No model can
    # beat a permuted-label control on this because there is nothing to learn.
    examples = []
    for index in range(80):
        examples.append(
            {
                "features": {
                    "subject_role": 0,
                    "ghost_rate": 0.1,
                    "completion_rate": 0.9,
                    "avg_review_rating": 4.0,
                    "observed_engagement_count": 10,
                    "on_time_rate": 0.8,
                    "avg_days_late": 0.0,
                    "recency_weighted_on_time_rate": 0.8,
                    "paid_in_full_rate": float("nan"),
                    "scope_creep_rate": float("nan"),
                    "trend_slope": 0.0,
                },
                "label_value": (index * 37) % 5 / 4,
            }
        )
    try:
        assert_role_learnability("freelancer", examples, _tiny_config())
    except LearnabilityError as error:
        assert "freelancer" in str(error)
    else:
        raise AssertionError("expected an unlearnable label to fail the learnability gate")
