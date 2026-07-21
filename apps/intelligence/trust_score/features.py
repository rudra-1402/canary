FEATURE_NAMES = [
    "paid_in_full_rate",
    "on_time_rate",
    "avg_days_late",
    "ghost_rate",
    "scope_creep_rate",
    "completion_rate",
    "avg_review_rating",
]


def _neutral_defaults() -> dict:
    return {
        "engagement_count": 0,
        "paid_in_full_rate": 0.5,
        "on_time_rate": 0.5,
        "avg_days_late": 0.0,
        "ghost_rate": 0.0,
        "scope_creep_rate": 0.0,
        "completion_rate": 0.5,
        "avg_review_rating": 3.0,
        "review_count": 0,
    }


def _static_aggregates(outcomes: list[dict], reviews: list[dict]) -> dict:
    engagement_count = len(outcomes)
    if engagement_count == 0:
        return _neutral_defaults()

    non_ghosted = [o for o in outcomes if not o["ghosted"]]
    return {
        "engagement_count": engagement_count,
        "paid_in_full_rate": sum(1 for o in outcomes if o["paidInFull"]) / engagement_count,
        "on_time_rate": (
            sum(1 for o in non_ghosted if (o["daysLate"] or 0) <= 0) / len(non_ghosted)
            if non_ghosted
            else 0.5
        ),
        "avg_days_late": (
            sum(o["daysLate"] or 0 for o in non_ghosted) / len(non_ghosted) if non_ghosted else 0.0
        ),
        "ghost_rate": sum(1 for o in outcomes if o["ghosted"]) / engagement_count,
        "scope_creep_rate": sum(1 for o in outcomes if o["scopeCreepOccurred"]) / engagement_count,
        "completion_rate": sum(1 for o in outcomes if o["endedAs"] == "completed") / engagement_count,
        "avg_review_rating": (sum(r["rating"] for r in reviews) / len(reviews)) if reviews else 3.0,
        "review_count": len(reviews),
    }


def compute_features(outcomes: list[dict], reviews: list[dict], as_of, config) -> dict:
    """Structured feature vector for one Profile, using only Outcome/Review rows
    at or before as_of -- the single place backfill's no-lookahead requirement
    (design spec's Error handling section) is enforced, shared by both the
    "current" score (as_of=now) and every historical snapshot."""
    outcomes_as_of = sorted((o for o in outcomes if o["recordedAt"] <= as_of), key=lambda o: o["recordedAt"])
    reviews_as_of = [r for r in reviews if r["createdAt"] <= as_of]
    return _static_aggregates(outcomes_as_of, reviews_as_of)
