from dataclasses import dataclass, field


@dataclass
class GeneratorConfig:
    seed: int = 42
    num_profiles: int = 500
    num_engagements: int = 2500
    # Multiplies the historical 1–4 JobPosts-per-client distribution. The CLI's
    # seed default raises this to 3.0; keep the data-class baseline at 1.0 so
    # focused component tests can opt into fan-out deliberately.
    engagement_fanout_multiplier: float = 1.0
    num_reviews: int = 4500
    timeline_months: int = 18
    proposal_duration_min_days: int = 7
    proposal_duration_max_days: int = 84
    revisions_included_min: int = 0
    revisions_included_max: int = 5
    late_miss_probability_floor: float = 0.08
    late_miss_probability_unreliability_weight: float = 0.75
    late_days_unreliability_scale: int = 14
    early_delivery_probability: float = 0.25
    early_delivery_max_days: int = 3
    paid_in_full_probability_floor: float = 0.74
    paid_in_full_reliability_weight: float = 0.25
    revisions_requested_unreliability_scale: float = 5.0
    revisions_requested_noise_std: float = 0.75

    reliable_rate: float = 0.65
    risky_rate: float = 0.18
    bad_actor_rate: float = 0.08
    trait_tier_centers: dict = field(
        default_factory=lambda: {"reliable": 0.85, "risky": 0.55, "bad-actor": 0.25}
    )
    trait_spread: float = 0.08
    trait_noise: float = 0.05

    monthly_drift_std: float = 0.02
    shock_probability: float = 0.04
    shock_std: float = 0.12

    archetype_thresholds: dict = field(default_factory=lambda: {"reliable": 0.68, "bad-actor": 0.42})

    cold_start_join_rate: float = 0.06
    cold_start_recent_months: int = 2
    colluder_rate: float = 0.02
    saboteur_rate: float = 0.04
