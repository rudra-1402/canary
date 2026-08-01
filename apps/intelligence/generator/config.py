from dataclasses import dataclass, field


@dataclass
class GeneratorConfig:
    seed: int = 42
    num_profiles: int = 500
    num_engagements: int = 2500
    num_reviews: int = 4500
    timeline_months: int = 18
    proposal_duration_min_days: int = 7
    proposal_duration_max_days: int = 84
    revisions_included_min: int = 0
    revisions_included_max: int = 5

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
    saboteur_rate: float = 0.01
