from datetime import datetime, timedelta

import pytest

from generator import outcomes as outcomes_module
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


_CONDUCT_FIELDS = (
    "deliveredAt",
    "daysLate",
    "paidInFull",
    "revisionsRequested",
    "scopeCreepOccurred",
)


def _concluded_engagement() -> dict:
    return {
        "_localId": "engagement-1",
        "status": "concluded",
        "freelancerProfileLocalId": "freelancer-1",
        "clientProfileLocalId": "client-1",
        "createdAt": datetime.utcnow() - timedelta(days=60),
    }


def _profiles_for_ghost_cases() -> list[dict]:
    traits = {"reliability": 0.8, "responsiveness": 0.8}
    return [
        {
            "_localId": "freelancer-1",
            "role": "freelancer",
            "trueArchetype": "reliable",
            "_traitTrajectory": [traits],
        },
        {
            "_localId": "client-1",
            "role": "client",
            "trueArchetype": "reliable",
            "_traitTrajectory": [traits],
        },
    ]


@pytest.mark.parametrize(
    ("freelancer_ghosts", "client_ghosts"),
    [(False, False), (False, True), (True, False), (True, True)],
    ids=("neither_ghosts", "client_ghosts", "freelancer_ghosts", "both_ghost"),
)
def test_outcomes_attribute_ghosting_and_observation_per_party(monkeypatch, freelancer_ghosts, client_ghosts):
    profiles = _profiles_for_ghost_cases()
    engagement = _concluded_engagement()
    ghost_probabilities = iter((float(freelancer_ghosts), float(client_ghosts)))
    monkeypatch.setattr(outcomes_module, "_party_ghost_probability", lambda *_: next(ghost_probabilities))

    outcomes = generate_outcomes(GeneratorConfig(seed=42), profiles, [engagement])

    assert len(outcomes) == 2
    freelancer_outcome = next(o for o in outcomes if o["subjectRole"] == "freelancer")
    client_outcome = next(o for o in outcomes if o["subjectRole"] == "client")
    assert freelancer_outcome["subjectProfileLocalId"] == "freelancer-1"
    assert freelancer_outcome["counterpartyProfileLocalId"] == "client-1"
    assert client_outcome["subjectProfileLocalId"] == "client-1"
    assert client_outcome["counterpartyProfileLocalId"] == "freelancer-1"
    assert freelancer_outcome["ghosted"] is freelancer_ghosts
    assert client_outcome["ghosted"] is client_ghosts
    assert freelancer_outcome["observed"] is (not client_ghosts or freelancer_ghosts)
    assert client_outcome["observed"] is (not freelancer_ghosts or client_ghosts)
    expected_endings = {"ghosted"} if freelancer_ghosts or client_ghosts else {"completed", "cancelled"}
    assert freelancer_outcome["endedAs"] in expected_endings
    assert client_outcome["endedAs"] == freelancer_outcome["endedAs"]
    for outcome in outcomes:
        for field in _CONDUCT_FIELDS:
            assert outcome[field] is None


def test_every_concluded_engagement_produces_one_mapped_outcome_per_party():
    config, profiles, engagements = _setup()
    outcomes = generate_outcomes(config, profiles, engagements)
    concluded_engagements = [e for e in engagements if e["status"] == "concluded"]

    assert len(outcomes) == 2 * len(concluded_engagements)
    for engagement in concluded_engagements:
        engagement_outcomes = [o for o in outcomes if o["engagementLocalId"] == engagement["_localId"]]
        assert len(engagement_outcomes) == 2
        freelancer_outcome = next(o for o in engagement_outcomes if o["subjectRole"] == "freelancer")
        client_outcome = next(o for o in engagement_outcomes if o["subjectRole"] == "client")
        assert freelancer_outcome["subjectProfileLocalId"] == engagement["freelancerProfileLocalId"]
        assert freelancer_outcome["counterpartyProfileLocalId"] == engagement["clientProfileLocalId"]
        assert client_outcome["subjectProfileLocalId"] == engagement["clientProfileLocalId"]
        assert client_outcome["counterpartyProfileLocalId"] == engagement["freelancerProfileLocalId"]


def test_freelancer_ghost_rate_is_independent_of_client_archetype():
    config, profiles, engagements = _setup(num_profiles=2000)
    outcomes = generate_outcomes(config, profiles, engagements)
    profiles_by_id = {profile["_localId"]: profile for profile in profiles}
    freelancer_outcomes = [outcome for outcome in outcomes if outcome["subjectRole"] == "freelancer"]
    ghost_rates_by_client_archetype = {}
    for archetype in {profile["trueArchetype"] for profile in profiles if profile["role"] == "client"}:
        matching_outcomes = [
            outcome
            for outcome in freelancer_outcomes
            if profiles_by_id[outcome["counterpartyProfileLocalId"]]["trueArchetype"] == archetype
        ]
        if matching_outcomes:
            ghost_rates_by_client_archetype[archetype] = sum(
                outcome["ghosted"] for outcome in matching_outcomes
            ) / len(matching_outcomes)

    assert max(ghost_rates_by_client_archetype.values()) - min(ghost_rates_by_client_archetype.values()) < 0.2


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
