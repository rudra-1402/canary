import random
from datetime import datetime, timedelta

from faker import Faker

from generator.archetypes import (
    assign_special_roles,
    assign_traits,
    derive_archetype,
    simulate_trait_drift,
)
from generator.clock import resolve_now
from generator.config import GeneratorConfig

VERIFIED_RATE_BY_ARCHETYPE = {
    "reliable": 0.85,
    "risky": 0.6,
    "bad-actor": 0.2,
    "cold-start": 0.3,
    "colluder": 0.5,
    "saboteur": 0.4,
}

# bcryptjs generated this once with the API's 12-round verifier for the known
# development password `canary-demo-password`. Raw pymongo seed writes bypass
# the registration path, so every synthetic Identity needs this local-login
# provision explicitly rather than a placeholder OAuth provider id.
SEED_DEV_PASSWORD_HASH = "$2b$12$XT.ISsDwePIbMP.KWFjc2uTK6w25hbfpVzFj0.MJS5PPzIXJWM36m"


def _assign_join_month_index(rng: random.Random, config: GeneratorConfig) -> int:
    if rng.random() < config.cold_start_join_rate:
        return rng.randint(
            max(0, config.timeline_months - config.cold_start_recent_months), config.timeline_months
        )
    return rng.randint(0, max(0, config.timeline_months - config.cold_start_recent_months - 1))


def generate_identities_and_profiles(
    config: GeneratorConfig, *, now: datetime | None = None
) -> tuple[list[dict], list[dict]]:
    rng = random.Random(config.seed)
    fake = Faker()
    Faker.seed(config.seed)

    initial_traits = assign_traits(config)
    trajectories = simulate_trait_drift(config, initial_traits)
    special_roles = assign_special_roles(config)

    now = resolve_now(config, now)
    identities = []
    profiles = []

    for i, (traits, trajectory, special_role) in enumerate(
        zip(initial_traits, trajectories, special_roles, strict=True)
    ):
        role = "freelancer" if rng.random() < 0.6 else "client"
        origin = "synthetic-seeded" if rng.random() < 0.9 else "user-registered"

        join_month_index = _assign_join_month_index(rng, config)
        created_at = now - timedelta(days=30 * (config.timeline_months - join_month_index))
        is_cold_start = join_month_index >= config.timeline_months - config.cold_start_recent_months

        if special_role:
            archetype = special_role
        elif is_cold_start:
            archetype = "cold-start"
        else:
            archetype = derive_archetype(traits, config)

        identity = {
            "_localId": f"identity-{i}",
            "email": fake.unique.email(),
            "passwordHash": SEED_DEV_PASSWORD_HASH,
            "emailVerified": True,
            "activeProfileLocalId": f"profile-{i}",
            # Reuses the same created_at as the profile below — an Identity and
            # its first Profile are created at the same signup moment. Needed
            # explicitly because the orchestrator writes via raw pymongo, which
            # never triggers Mongoose's timestamps:true default.
            "createdAt": created_at,
        }
        identities.append(identity)

        verified_rate = VERIFIED_RATE_BY_ARCHETYPE[archetype]
        profile = {
            "_localId": f"profile-{i}",
            "identityLocalId": identity["_localId"],
            "role": role,
            "origin": origin,
            "discoverable": True if origin == "synthetic-seeded" else rng.random() < 0.5,
            "displayName": fake.name(),
            "verificationStatus": "id-verified" if rng.random() < verified_rate else "none",
            "trueArchetype": archetype,
            "createdAt": created_at,
            "_traitTrajectory": trajectory,
            "_joinMonthIndex": join_month_index,
        }
        if role == "freelancer":
            profile["skills"] = rng.sample(
                ["react", "node", "python", "design", "copywriting", "seo", "django"], k=3
            )
            profile["hourlyRate"] = rng.randint(15, 120)
            profile["country"] = fake.country()
        else:
            profile["industry"] = rng.choice(["ecommerce", "fintech", "media", "healthcare"])
            profile["typicalBudget"] = rng.randint(500, 20000)

        profiles.append(profile)

    return identities, profiles
