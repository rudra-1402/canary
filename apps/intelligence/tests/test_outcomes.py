from datetime import datetime, timedelta

from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import generate_outcomes
from generator.proposals import generate_proposals


def _setup(num_profiles=300):
    config = GeneratorConfig(seed=42, num_profiles=num_profiles)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    return config, profiles, engagements


def test_outcomes_only_generated_for_concluded_engagements():
    config, profiles, engagements = _setup()
    outcomes = generate_outcomes(config, profiles, engagements)
    concluded_ids = {e["_localId"] for e in engagements if e["status"] == "concluded"}
    assert all(o["engagementLocalId"] in concluded_ids for o in outcomes)


def test_bad_actors_ghost_more_than_reliable_parties():
    config, profiles, engagements = _setup(num_profiles=500)
    outcomes = generate_outcomes(config, profiles, engagements)
    profiles_by_id = {p["_localId"]: p for p in profiles}
    engagements_by_id = {e["_localId"]: e for e in engagements}

    def is_bad_actor_engagement(o):
        e = engagements_by_id[o["engagementLocalId"]]
        f = profiles_by_id[e["freelancerProfileLocalId"]]
        c = profiles_by_id[e["clientProfileLocalId"]]
        return f["trueArchetype"] == "bad-actor" or c["trueArchetype"] == "bad-actor"

    bad_actor_outcomes = [o for o in outcomes if is_bad_actor_engagement(o)]
    other_outcomes = [o for o in outcomes if not is_bad_actor_engagement(o)]
    assert bad_actor_outcomes, "expected at least one bad-actor engagement in this seed"
    bad_ghost_rate = sum(o["ghosted"] for o in bad_actor_outcomes) / len(bad_actor_outcomes)
    other_ghost_rate = sum(o["ghosted"] for o in other_outcomes) / len(other_outcomes)
    assert bad_ghost_rate > other_ghost_rate


def test_drifting_profile_shows_worse_outcomes_later_than_earlier():
    """A profile whose trait trajectory DECLINES over time should ghost more in
    LATER engagements than EARLIER ones. Uses many trial seeds since a single
    draw is a coin flip either way."""
    now = datetime.utcnow()
    declining_trajectory = [
        {"reliability": max(0.05, 0.9 - 0.05 * i), "responsiveness": max(0.05, 0.9 - 0.05 * i)}
        for i in range(19)
    ]
    freelancer = {
        "_localId": "f1",
        "role": "freelancer",
        "trueArchetype": "risky",
        "_traitTrajectory": declining_trajectory,
    }
    client = {
        "_localId": "c1",
        "role": "client",
        "trueArchetype": "reliable",
        "_traitTrajectory": [{"reliability": 0.9, "responsiveness": 0.9}] * 19,
    }
    profiles = [freelancer, client]
    early_engagement = {
        "_localId": "e-early",
        "status": "concluded",
        "freelancerProfileLocalId": "f1",
        "clientProfileLocalId": "c1",
        "createdAt": now - timedelta(days=30 * 17),
    }
    late_engagement = {
        "_localId": "e-late",
        "status": "concluded",
        "freelancerProfileLocalId": "f1",
        "clientProfileLocalId": "c1",
        "createdAt": now - timedelta(days=30 * 1),
    }

    early_ghost_count = 0
    late_ghost_count = 0
    trials = 300
    for trial_seed in range(trials):
        trial_config = GeneratorConfig(seed=trial_seed, num_profiles=1, timeline_months=18)
        early_ghost_count += generate_outcomes(trial_config, profiles, [early_engagement])[0]["ghosted"]
        late_ghost_count += generate_outcomes(trial_config, profiles, [late_engagement])[0]["ghosted"]

    assert late_ghost_count > early_ghost_count
