from datetime import datetime, timedelta

from trust_score.explain import explain_profile
from trust_score.features import compute_features
from trust_score.model import is_cold_start, score_profile

COLD_START_SNAPSHOT = {
    "score": 50,
    "level": "med",
    "riskSignals": [
        {
            "name": "insufficient-history",
            "value": 0.0,
            "direction": "unfavorable",
            "source": "structured-data",
        }
    ],
}


def month_boundary_dates(timeline_months: int, now: datetime | None = None) -> list[datetime]:
    """Return month 0 through month N using the generator's 30-day convention."""
    now = now or datetime.utcnow()
    window_start = now - timedelta(days=30 * timeline_months)
    return [window_start + timedelta(days=30 * month) for month in range(timeline_months + 1)]


def score_and_explain(model, explainer, features: dict, config) -> dict:
    if is_cold_start(features, config):
        return {
            **COLD_START_SNAPSHOT,
            "riskSignals": list(COLD_START_SNAPSHOT["riskSignals"]),
        }

    scored = score_profile(model, features)
    return {
        "score": scored["score"],
        "level": scored["level"],
        "riskSignals": explain_profile(explainer, features),
    }


def backfill_profile(
    outcomes: list[dict],
    reviews: list[dict],
    model,
    explainer,
    config,
    timeline_months: int,
    now: datetime | None = None,
) -> list[dict]:
    """Replay scoring at each boundary, letting compute_features enforce as-of filtering."""
    now = now or datetime.utcnow()
    snapshots = []
    for boundary in month_boundary_dates(timeline_months, now):
        features = compute_features(outcomes, reviews, boundary, config)
        snapshot = score_and_explain(model, explainer, features, config)
        snapshot["generatedAt"] = boundary
        snapshots.append(snapshot)
    return snapshots
