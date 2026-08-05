from trust_score.explain import FEATURE_DISPLAY_NAMES


def test_subject_role_has_a_human_explanation_label():
    assert FEATURE_DISPLAY_NAMES["subject_role"] == "profile-role"
