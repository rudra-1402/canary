import math

# The Trust Score model has one role-aware superset schema. model.py imports this
# object directly; do not duplicate the list there.
FEATURE_NAMES = [
    "subject_role",
    "ghost_rate",
    "completion_rate",
    "avg_review_rating",
    "observed_engagement_count",
    "on_time_rate",
    "avg_days_late",
    "recency_weighted_on_time_rate",
    "paid_in_full_rate",
    "scope_creep_rate",
    "trend_slope",
]

ROLE_ENCODING = {"freelancer": 0, "client": 1}


def encode_subject_role(subject_role: str) -> int:
    try:
        return ROLE_ENCODING[subject_role]
    except KeyError as error:
        raise ValueError(f"Unsupported subject role: {subject_role!r}") from error


def _neutral_defaults(subject_role: str) -> dict:
    features = {
        "subject_role": encode_subject_role(subject_role),
        "engagement_count": 0,
        "observed_engagement_count": 0,
        "ghost_rate": 0.0,
        "completion_rate": 0.5,
        "avg_review_rating": 3.0,
        "review_count": 0,
        "trend_slope": 0.0,
        "on_time_rate": math.nan,
        "avg_days_late": math.nan,
        "recency_weighted_on_time_rate": math.nan,
        "paid_in_full_rate": math.nan,
        "scope_creep_rate": math.nan,
    }
    if subject_role == "freelancer":
        features.update(
            on_time_rate=0.5,
            avg_days_late=0.0,
            recency_weighted_on_time_rate=0.5,
        )
    else:
        features.update(paid_in_full_rate=0.5, scope_creep_rate=0.5)
    return features


def _static_aggregates(outcomes: list[dict], reviews: list[dict], subject_role: str) -> dict:
    if not outcomes:
        return _neutral_defaults(subject_role)

    features = _neutral_defaults(subject_role)
    engagement_count = len(outcomes)
    features.update(
        engagement_count=engagement_count,
        observed_engagement_count=engagement_count,
        ghost_rate=sum(1 for outcome in outcomes if outcome["ghosted"]) / engagement_count,
        completion_rate=sum(1 for outcome in outcomes if outcome["endedAs"] == "completed")
        / engagement_count,
        avg_review_rating=(sum(review["rating"] for review in reviews) / len(reviews)) if reviews else 3.0,
        review_count=len(reviews),
    )

    if subject_role == "freelancer":
        delivery_outcomes = [
            outcome for outcome in outcomes if not outcome["ghosted"] and outcome["daysLate"] is not None
        ]
        if delivery_outcomes:
            features["on_time_rate"] = sum(
                1 for outcome in delivery_outcomes if outcome["daysLate"] <= 0
            ) / len(delivery_outcomes)
            features["avg_days_late"] = sum(outcome["daysLate"] for outcome in delivery_outcomes) / len(
                delivery_outcomes
            )
        return features

    payment_outcomes = [outcome for outcome in outcomes if outcome["paidInFull"] is not None]
    scope_creep_outcomes = [outcome for outcome in outcomes if outcome["scopeCreepOccurred"] is not None]
    if payment_outcomes:
        features["paid_in_full_rate"] = sum(1 for outcome in payment_outcomes if outcome["paidInFull"]) / len(
            payment_outcomes
        )
    if scope_creep_outcomes:
        features["scope_creep_rate"] = sum(
            1 for outcome in scope_creep_outcomes if outcome["scopeCreepOccurred"]
        ) / len(scope_creep_outcomes)
    return features


def _recency_weighted_on_time_rate(delivery_outcomes: list[dict], as_of, halflife_months: float) -> float:
    if not delivery_outcomes:
        return 0.5
    weighted_sum = 0.0
    weight_total = 0.0
    for outcome in delivery_outcomes:
        age_months = (as_of - outcome["recordedAt"]).days / 30
        weight = 0.5 ** (age_months / halflife_months)
        weighted_sum += weight * (1.0 if outcome["daysLate"] <= 0 else 0.0)
        weight_total += weight
    return weighted_sum / weight_total if weight_total else 0.5


def _trend_slope(primary_outcomes: list[dict], succeeded) -> float:
    """Recent-minus-older rate over the role's primary conduct signal."""
    if len(primary_outcomes) < 2:
        return 0.0
    midpoint = len(primary_outcomes) // 2
    older, recent = primary_outcomes[:midpoint], primary_outcomes[midpoint:]
    return sum(1.0 for outcome in recent if succeeded(outcome)) / len(recent) - sum(
        1.0 for outcome in older if succeeded(outcome)
    ) / len(older)


def compute_features(outcomes: list[dict], reviews: list[dict], subject_role: str, as_of, config) -> dict:
    """Build one numeric superset feature vector for a single Profile role.

    Role-inapplicable conduct is deliberately represented by NaN. XGBoost uses
    that missingness directly; zero would fabricate good conduct for a role that
    never had the opportunity to exhibit it.
    """
    encode_subject_role(subject_role)
    outcomes_as_of = sorted(
        (outcome for outcome in outcomes if outcome["recordedAt"] <= as_of and outcome.get("observed", True)),
        key=lambda outcome: outcome["recordedAt"],
    )
    reviews_as_of = [review for review in reviews if review["createdAt"] <= as_of]
    features = _static_aggregates(outcomes_as_of, reviews_as_of, subject_role)

    if subject_role == "freelancer":
        delivery_outcomes = [
            outcome
            for outcome in outcomes_as_of
            if not outcome["ghosted"] and outcome["daysLate"] is not None
        ]
        features["recency_weighted_on_time_rate"] = _recency_weighted_on_time_rate(
            delivery_outcomes, as_of, config.ewma_halflife_months
        )
        features["trend_slope"] = _trend_slope(delivery_outcomes, lambda outcome: outcome["daysLate"] <= 0)
    else:
        payment_outcomes = [outcome for outcome in outcomes_as_of if outcome["paidInFull"] is not None]
        features["trend_slope"] = _trend_slope(payment_outcomes, lambda outcome: outcome["paidInFull"])
    return features
