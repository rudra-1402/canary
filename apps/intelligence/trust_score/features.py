FEATURE_NAMES = [
    "paid_in_full_rate",
    "on_time_rate",
    "avg_days_late",
    "ghost_rate",
    "scope_creep_rate",
    "completion_rate",
    "avg_review_rating",
    "recency_weighted_on_time_rate",
    "trend_slope",
]


def _neutral_defaults() -> dict:
    return {
        "engagement_count": 0,
        "observed_engagement_count": 0,
        "paid_in_full_rate": 0.5,
        "on_time_rate": 0.5,
        "avg_days_late": 0.0,
        "ghost_rate": 0.0,
        "scope_creep_rate": 0.0,
        "completion_rate": 0.5,
        "avg_review_rating": 3.0,
        "review_count": 0,
        "recency_weighted_on_time_rate": 0.5,
        "trend_slope": 0.0,
    }


def _static_aggregates(outcomes: list[dict], reviews: list[dict]) -> dict:
    engagement_count = len(outcomes)
    if engagement_count == 0:
        return _neutral_defaults()

    non_ghosted = [o for o in outcomes if not o["ghosted"]]
    delivery_outcomes = [o for o in non_ghosted if o["daysLate"] is not None]
    payment_outcomes = [o for o in outcomes if o["paidInFull"] is not None]
    scope_creep_outcomes = [o for o in outcomes if o["scopeCreepOccurred"] is not None]
    return {
        "engagement_count": engagement_count,
        "observed_engagement_count": engagement_count,
        "paid_in_full_rate": (
            sum(1 for o in payment_outcomes if o["paidInFull"]) / len(payment_outcomes)
            if payment_outcomes
            else 0.5
        ),
        "on_time_rate": (
            sum(1 for o in delivery_outcomes if o["daysLate"] <= 0) / len(delivery_outcomes)
            if delivery_outcomes
            else 0.5
        ),
        "avg_days_late": (
            sum(o["daysLate"] for o in delivery_outcomes) / len(delivery_outcomes)
            if delivery_outcomes
            else 0.0
        ),
        "ghost_rate": sum(1 for o in outcomes if o["ghosted"]) / engagement_count,
        "scope_creep_rate": (
            sum(1 for o in scope_creep_outcomes if o["scopeCreepOccurred"]) / len(scope_creep_outcomes)
            if scope_creep_outcomes
            else 0.5
        ),
        "completion_rate": sum(1 for o in outcomes if o["endedAs"] == "completed") / engagement_count,
        "avg_review_rating": (sum(r["rating"] for r in reviews) / len(reviews)) if reviews else 3.0,
        "review_count": len(reviews),
    }


def _recency_weighted_on_time_rate(
    sorted_delivery_outcomes: list[dict], as_of, halflife_months: float
) -> float:
    if not sorted_delivery_outcomes:
        return 0.5
    weighted_sum = 0.0
    weight_total = 0.0
    for outcome in sorted_delivery_outcomes:
        age_months = (as_of - outcome["recordedAt"]).days / 30
        weight = 0.5 ** (age_months / halflife_months)
        on_time = 1.0 if outcome["daysLate"] <= 0 else 0.0
        weighted_sum += weight * on_time
        weight_total += weight
    return weighted_sum / weight_total if weight_total else 0.5


def _trend_slope(sorted_delivery_outcomes: list[dict]) -> float:
    if len(sorted_delivery_outcomes) < 2:
        return 0.0
    mid = len(sorted_delivery_outcomes) // 2
    older, recent = sorted_delivery_outcomes[:mid], sorted_delivery_outcomes[mid:]

    def on_time_rate(group):
        return sum(1.0 for o in group if o["daysLate"] <= 0) / len(group)

    return on_time_rate(recent) - on_time_rate(older)


def compute_features(outcomes: list[dict], reviews: list[dict], as_of, config) -> dict:
    """Structured feature vector for one Profile, using only Outcome/Review rows
    at or before as_of -- the single place backfill's no-lookahead requirement
    (design spec's Error handling section) is enforced, shared by both the
    "current" score (as_of=now) and every historical snapshot."""
    outcomes_as_of = sorted(
        (o for o in outcomes if o["recordedAt"] <= as_of and o.get("observed", True)),
        key=lambda o: o["recordedAt"],
    )
    reviews_as_of = [r for r in reviews if r["createdAt"] <= as_of]
    delivery_outcomes = [o for o in outcomes_as_of if not o["ghosted"] and o["daysLate"] is not None]

    features = _static_aggregates(outcomes_as_of, reviews_as_of)
    features["recency_weighted_on_time_rate"] = _recency_weighted_on_time_rate(
        delivery_outcomes, as_of, config.ewma_halflife_months
    )
    features["trend_slope"] = _trend_slope(delivery_outcomes)
    return features
