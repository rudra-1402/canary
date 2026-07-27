from trust_score.config import TrustScoreConfig


def test_default_config_has_expected_values():
    config = TrustScoreConfig()
    assert config.seed == 42
    assert config.timeline_months == 18
    assert config.min_engagements_for_scoring == 3
    assert config.eval_test_size == 0.25


def test_config_fields_are_overridable():
    config = TrustScoreConfig(seed=7, min_engagements_for_scoring=5)
    assert config.seed == 7
    assert config.min_engagements_for_scoring == 5
