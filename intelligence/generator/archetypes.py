import random
from generator.config import GeneratorConfig

ARCHETYPES = ["reliable", "risky", "bad-actor"]
SPECIAL_ROLES = ["colluder", "saboteur"]


def assign_traits(config: GeneratorConfig) -> list[dict]:
    """Per-profile initial (month-0) reliability/responsiveness traits. Tier
    SELECTION uses exact weights (so the derived-archetype mix stays controllable
    and testable); trait VALUES within a tier are continuous and noisy."""
    rng = random.Random(config.seed)
    tier_names = ["reliable", "risky", "bad-actor"]
    tier_weights = [config.reliable_rate, config.risky_rate, config.bad_actor_rate]

    traits = []
    for _ in range(config.num_profiles):
        tier = rng.choices(tier_names, weights=tier_weights)[0]
        center = config.trait_tier_centers[tier]
        latent = min(1.0, max(0.0, rng.gauss(center, config.trait_spread)))
        reliability = min(1.0, max(0.0, latent + rng.gauss(0, config.trait_noise)))
        responsiveness = min(1.0, max(0.0, latent + rng.gauss(0, config.trait_noise)))
        traits.append({"reliability": reliability, "responsiveness": responsiveness})
    return traits


def simulate_trait_drift(config: GeneratorConfig, initial_traits: list[dict]) -> list[list[dict]]:
    """Per-profile monthly trait trajectory across the timeline — a bounded random
    walk (routine drift + occasional larger shocks). Index 0 is the initial
    snapshot; index i is the snapshot at month i."""
    rng = random.Random(config.seed + 100)
    trajectories = []
    for traits in initial_traits:
        trajectory = [dict(traits)]
        current = dict(traits)
        for _month in range(config.timeline_months):
            for key in ("reliability", "responsiveness"):
                step = rng.gauss(0, config.monthly_drift_std)
                if rng.random() < config.shock_probability:
                    step += rng.gauss(0, config.shock_std)
                current[key] = min(1.0, max(0.0, current[key] + step))
            trajectory.append(dict(current))
        trajectories.append(trajectory)
    return trajectories


def derive_archetype(traits: dict, config: GeneratorConfig) -> str:
    """Bucket a continuous trait snapshot (initial or drifted) into a discrete
    reliable/risky/bad-actor label."""
    combined = (traits["reliability"] + traits["responsiveness"]) / 2
    if combined >= config.archetype_thresholds["reliable"]:
        return "reliable"
    if combined >= config.archetype_thresholds["bad-actor"]:
        return "risky"
    return "bad-actor"


def assign_special_roles(config: GeneratorConfig) -> list[str | None]:
    """Per-profile planted categorical role: 'colluder', 'saboteur', or None.
    Independent of the continuous traits — planted, coordinated adversarial
    patterns, not organic behavioral drift."""
    rng = random.Random(config.seed + 200)
    roles = []
    for _ in range(config.num_profiles):
        roll = rng.random()
        if roll < config.colluder_rate:
            roles.append("colluder")
        elif roll < config.colluder_rate + config.saboteur_rate:
            roles.append("saboteur")
        else:
            roles.append(None)
    return roles


def assign_archetypes(config: GeneratorConfig) -> list[str]:
    """Back-compat convenience: one representative label per profile (special role
    if planted, else the trait-derived bucket at month 0). Cold-start is NOT
    assigned here — it's derived from join recency in Task 14."""
    initial_traits = assign_traits(config)
    special_roles = assign_special_roles(config)
    labels = []
    for traits, role in zip(initial_traits, special_roles):
        labels.append(role if role else derive_archetype(traits, config))
    return labels
