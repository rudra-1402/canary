from datetime import datetime, timedelta

from trust_score.explain import explain_profile
from trust_score.features import compute_features, encode_subject_role
from trust_score.model import score_profile


def month_boundary_dates(timeline_months: int, now: datetime | None = None) -> list[datetime]:
    """Return month 0 through month N using the generator's 30-day convention."""
    now = now or datetime.utcnow()
    window_start = now - timedelta(days=30 * timeline_months)
    return [window_start + timedelta(days=30 * month) for month in range(timeline_months + 1)]


def score_and_explain(model, explainer, features: dict, config) -> dict:
    del config
    prediction = score_profile(model, features)
    return {**prediction, "riskSignals": explain_profile(explainer, features)}


def backfill_feature_rows(
    outcomes: list[dict],
    reviews: list[dict],
    subject_role: str,
    config,
    timeline_months: int,
    now: datetime | None = None,
) -> list[dict]:
    """Replay role-aware feature preparation at each historical boundary.

    The encoded role appears both on the prepared row and inside its feature
    vector, so historical and current rows have the same model-facing schema.
    """
    now = now or datetime.utcnow()
    encoded_role = encode_subject_role(subject_role)
    return [
        {
            "generatedAt": boundary,
            "subject_role": encoded_role,
            "features": compute_features(outcomes, reviews, subject_role, boundary, config),
        }
        for boundary in month_boundary_dates(timeline_months, now)
    ]


def backfill_profile(*args, **kwargs):
    raise NotImplementedError("backfill_profile requires the persistence schedule owned by its caller.")
