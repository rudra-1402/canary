import shap

from trust_score.labels import LABEL_TO_INT
from trust_score.model import FEATURE_COLUMNS, features_to_dataframe

FAVORABLE_CLASS_INDEX = LABEL_TO_INT["high"]
TOP_K_SIGNALS = 3

FEATURE_DISPLAY_NAMES = {
    "subject_role": "profile-role",
    "paid_in_full_rate": "paid-in-full-rate",
    "on_time_rate": "on-time-rate",
    "avg_days_late": "avg-days-late",
    "ghost_rate": "ghost-rate",
    "scope_creep_rate": "scope-creep-rate",
    "completion_rate": "completion-rate",
    "avg_review_rating": "review-rating",
    "observed_engagement_count": "observed-engagement-count",
    "recency_weighted_on_time_rate": "recent-on-time-trend",
    "trend_slope": "trust-trend",
}


def build_explainer(model) -> shap.TreeExplainer:
    """Built once per trained model and reused across every profile scored
    with it -- constructing a TreeExplainer per-call would be wasteful across
    ~500 profiles x 19 monthly snapshots."""
    return shap.TreeExplainer(model)


def explain_profile(explainer: shap.TreeExplainer, features: dict) -> list[dict]:
    """Decision 4: SHAP values are a per-prediction, additive decomposition --
    'for this profile, on-time-payment contributed +7' -- unlike global
    feature_importances_. shap_values shape is (n_samples, n_features,
    n_classes); we read the 'high' (reliable) class's contributions so a
    positive value means 'pushed this profile toward more trustworthy'."""
    X = features_to_dataframe([features])
    shap_values = explainer.shap_values(X)
    contributions = shap_values[0, :, FAVORABLE_CLASS_INDEX]

    ranked = sorted(
        zip(FEATURE_COLUMNS, contributions, strict=True), key=lambda pair: abs(pair[1]), reverse=True
    )
    signals = []
    for feature_name, contribution in ranked[:TOP_K_SIGNALS]:
        signals.append(
            {
                "name": FEATURE_DISPLAY_NAMES[feature_name],
                "value": round(float(contribution), 4),
                "direction": "favorable" if contribution > 0 else "unfavorable",
                "source": "structured-data",
            }
        )
    return signals
