from datetime import datetime, timedelta

import pytest

from generator import outcomes as outcomes_module
from generator.clock import resolve_now
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


def test_outcome_timestamps_are_real_conclusion_moments():
    """Conclusion timestamps must be usable as temporal-label boundaries."""
    config, profiles, engagements = _setup(num_profiles=2000)
    now = datetime.utcnow()
    outcomes = generate_outcomes(config, profiles, engagements, now=now)
    engagements_by_id = {engagement["_localId"]: engagement for engagement in engagements}

    assert outcomes
    assert all(
        outcome["recordedAt"] != engagements_by_id[outcome["engagementLocalId"]]["createdAt"]
        for outcome in outcomes
    )
    assert all(
        outcome["recordedAt"] > engagements_by_id[outcome["engagementLocalId"]]["createdAt"]
        for outcome in outcomes
    )
    assert all(outcome["recordedAt"] <= now for outcome in outcomes)
    assert len({(outcome["recordedAt"].year, outcome["recordedAt"].month) for outcome in outcomes}) >= 12


_CONDUCT_FIELDS = (
    "deliveredAt",
    "daysLate",
    "paidInFull",
    "revisionsRequested",
    "scopeCreepOccurred",
)

_CORE_ARCHETYPES = ("reliable", "risky", "bad-actor")


def _pooled_population_separation(values_by_archetype: dict[str, list[float]]) -> float:
    """Spread of archetype means in pooled population standard deviations."""
    values = [value for archetype_values in values_by_archetype.values() for value in archetype_values]
    mean = sum(values) / len(values)
    population_std = (sum((value - mean) ** 2 for value in values) / len(values)) ** 0.5
    means = [
        sum(archetype_values) / len(archetype_values) for archetype_values in values_by_archetype.values()
    ]
    return (max(means) - min(means)) / population_std


def _eligible_outcomes_by_archetype(
    outcomes: list[dict],
    profiles: list[dict],
    role: str,
    value,
) -> dict[str, list[float]]:
    profiles_by_id = {profile["_localId"]: profile for profile in profiles}
    values_by_archetype = {archetype: [] for archetype in _CORE_ARCHETYPES}
    for outcome in outcomes:
        if outcome["subjectRole"] != role or not outcome["observed"] or outcome["ghosted"]:
            continue
        archetype = profiles_by_id[outcome["subjectProfileLocalId"]]["trueArchetype"]
        if archetype in values_by_archetype:
            values_by_archetype[archetype].append(float(value(outcome)))

    assert all(values_by_archetype.values()), "expected eligible outcomes for every core archetype"
    return values_by_archetype


def _eligible_conduct_values(outcomes: list[dict], role: str, field: str) -> list:
    values = [
        outcome[field]
        for outcome in outcomes
        if outcome["subjectRole"] == role and outcome["observed"] and not outcome["ghosted"]
    ]
    assert all(value is not None for value in values)
    return values


def _concluded_engagement() -> dict:
    # Anchored to the same seed=42 default `now` that the bare
    # `generate_outcomes(GeneratorConfig(seed=42), ...)` calls below resolve
    # internally -- a wall-clock anchor here would drift out of sync with the
    # generator's synthetic "now" and make build_timelines see a due date in
    # what it considers its own future.
    now = resolve_now(GeneratorConfig(seed=42))
    due_at = now - timedelta(days=30)
    return {
        "_localId": "engagement-1",
        "status": "concluded",
        "freelancerProfileLocalId": "freelancer-1",
        "clientProfileLocalId": "client-1",
        "createdAt": now - timedelta(days=60),
        "agreedTerms": {"dueAt": due_at, "revisionsIncluded": 2},
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
        if outcome["ghosted"] or not outcome["observed"]:
            for field in _CONDUCT_FIELDS:
                assert outcome[field] is None
        elif outcome["subjectRole"] == "freelancer":
            assert outcome["deliveredAt"] is not None
            assert outcome["daysLate"] is not None
            assert outcome["paidInFull"] is None
            assert outcome["revisionsRequested"] is None
            assert outcome["scopeCreepOccurred"] is None
        else:
            assert outcome["deliveredAt"] is None
            assert outcome["daysLate"] is None
            assert outcome["paidInFull"] is not None
            assert outcome["revisionsRequested"] is not None
            assert outcome["scopeCreepOccurred"] is not None


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


def test_ghosting_separates_archetypes_by_the_subjects_own_conduct():
    """Two defects fixed here at once.

    It grouped by "engagement involves a bad actor on EITHER side", which since
    the per-party split attributes a bad actor's ghosting to their innocent
    counterparty's row — the shared-attribution defect this segment abolishes,
    surviving inside a test. Grouping is now the subject's own archetype.

    And it asserted only `bad > other`, which passes at 0.9 vs 0.1 and at
    0.0001 vs 0.00001. Sign is not behaviour. The magnitude floor is 0.5, the
    same floor the plan sets for any feature the model consumes — and
    ghost_rate is one.
    """
    config, profiles, engagements = _setup(num_profiles=500)
    outcomes = generate_outcomes(config, profiles, engagements)
    profiles_by_id = {p["_localId"]: p for p in profiles}

    ghosted_by_archetype: dict[str, list[float]] = {}
    for outcome in outcomes:
        subject = profiles_by_id[outcome["subjectProfileLocalId"]]
        ghosted_by_archetype.setdefault(subject["trueArchetype"], []).append(
            1.0 if outcome["ghosted"] else 0.0
        )

    assert {"reliable", "bad-actor"} <= set(
        ghosted_by_archetype
    ), "expected both reliable and bad-actor subjects in this seed"

    assert _pooled_population_separation(ghosted_by_archetype) >= 0.5

    rates = {a: sum(v) / len(v) for a, v in ghosted_by_archetype.items()}
    assert rates["bad-actor"] > rates["reliable"]  # direction: sanity check, not coverage


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
        "agreedTerms": {"dueAt": now - timedelta(days=30 * 16), "revisionsIncluded": 2},
    }
    late_engagement = {
        "_localId": "e-late",
        "status": "concluded",
        "freelancerProfileLocalId": "f1",
        "clientProfileLocalId": "c1",
        "createdAt": now - timedelta(days=30 * 1),
        "agreedTerms": {"dueAt": now - timedelta(days=1), "revisionsIncluded": 2},
    }

    early_ghost_count = 0
    late_ghost_count = 0
    trials = 300
    for trial_seed in range(trials):
        trial_config = GeneratorConfig(seed=trial_seed, num_profiles=1, timeline_months=18)
        early_ghost_count += outcomes_module.draw_relative_conduct(
            trial_config, profiles, [early_engagement]
        )[0]["ghosted"]
        late_ghost_count += outcomes_module.draw_relative_conduct(trial_config, profiles, [late_engagement])[
            0
        ]["ghosted"]

    assert late_ghost_count > early_ghost_count


def test_lateness_is_reachable_and_separates_archetypes():
    config, profiles, engagements = _setup(num_profiles=2000)
    outcomes = generate_outcomes(config, profiles, engagements)
    values_by_archetype = _eligible_outcomes_by_archetype(
        outcomes, profiles, "freelancer", lambda outcome: outcome["daysLate"] <= 0
    )

    on_time_rates = {
        archetype: sum(values) / len(values) for archetype, values in values_by_archetype.items()
    }
    overall_on_time_rate = sum(
        days_late <= 0 for days_late in _eligible_conduct_values(outcomes, "freelancer", "daysLate")
    ) / len(_eligible_conduct_values(outcomes, "freelancer", "daysLate"))

    assert all(rate > 0 for rate in on_time_rates.values())
    assert 0.55 <= overall_on_time_rate <= 0.90
    assert _pooled_population_separation(values_by_archetype) >= 0.5
    assert on_time_rates["reliable"] > on_time_rates["bad-actor"]


def test_lateness_can_record_early_delivery():
    config, profiles, engagements = _setup(num_profiles=2000)
    outcomes = generate_outcomes(config, profiles, engagements)

    assert any(
        outcome["daysLate"] < 0
        for outcome in outcomes
        if outcome["subjectRole"] == "freelancer" and outcome["observed"] and not outcome["ghosted"]
    )


def test_days_late_is_measured_from_the_agreed_due_at(monkeypatch):
    profiles = _profiles_for_ghost_cases()
    engagement = _concluded_engagement()
    monkeypatch.setattr(outcomes_module, "_party_ghost_probability", lambda *_: 0.0)

    outcomes = generate_outcomes(GeneratorConfig(seed=42), profiles, [engagement])
    freelancer_outcome = next(outcome for outcome in outcomes if outcome["subjectRole"] == "freelancer")

    assert (
        freelancer_outcome["daysLate"]
        == (freelancer_outcome["deliveredAt"] - engagement["agreedTerms"]["dueAt"]).days
    )


def test_paid_in_full_is_client_trait_signal_independent_of_ghosting():
    config, profiles, engagements = _setup(num_profiles=2000)
    outcomes = generate_outcomes(config, profiles, engagements)
    values_by_archetype = _eligible_outcomes_by_archetype(
        outcomes, profiles, "client", lambda outcome: outcome["paidInFull"]
    )
    paid_in_full_rate = sum(_eligible_conduct_values(outcomes, "client", "paidInFull")) / len(
        _eligible_conduct_values(outcomes, "client", "paidInFull")
    )

    assert _pooled_population_separation(values_by_archetype) >= 0.5
    assert _pooled_population_separation(values_by_archetype) >= 0.3
    assert 0.80 <= paid_in_full_rate <= 0.98


def test_scope_creep_is_derived_from_client_revisions(monkeypatch):
    profiles = _profiles_for_ghost_cases()
    engagement = _concluded_engagement()
    monkeypatch.setattr(outcomes_module, "_party_ghost_probability", lambda *_: 0.0)
    monkeypatch.setattr(outcomes_module, "_revisions_requested_from_traits", lambda *_: 3, raising=False)

    outcomes = generate_outcomes(GeneratorConfig(seed=42), profiles, [engagement])
    client_outcome = next(outcome for outcome in outcomes if outcome["subjectRole"] == "client")

    assert client_outcome["revisionsRequested"] == 3
    assert client_outcome["scopeCreepOccurred"] is (
        client_outcome["revisionsRequested"] > engagement["agreedTerms"]["revisionsIncluded"]
    )


def test_scope_creep_rate_and_client_trait_signal_are_plausible():
    config, profiles, engagements = _setup(num_profiles=2000)
    outcomes = generate_outcomes(config, profiles, engagements)
    values_by_archetype = _eligible_outcomes_by_archetype(
        outcomes, profiles, "client", lambda outcome: outcome["scopeCreepOccurred"]
    )
    scope_creep_rate = sum(_eligible_conduct_values(outcomes, "client", "scopeCreepOccurred")) / len(
        _eligible_conduct_values(outcomes, "client", "scopeCreepOccurred")
    )

    assert 0.10 <= scope_creep_rate <= 0.40
    assert _pooled_population_separation(values_by_archetype) >= 0.3


def test_conduct_nullability_matches_role_observation_and_ghosting():
    config, profiles, engagements = _setup(num_profiles=500)
    outcomes = generate_outcomes(config, profiles, engagements)

    for outcome in outcomes:
        if outcome["ghosted"] or not outcome["observed"]:
            assert all(outcome[field] is None for field in _CONDUCT_FIELDS)
        elif outcome["subjectRole"] == "freelancer":
            assert outcome["deliveredAt"] is not None
            assert outcome["daysLate"] is not None
            assert outcome["paidInFull"] is None
            assert outcome["revisionsRequested"] is None
            assert outcome["scopeCreepOccurred"] is None
        else:
            assert outcome["deliveredAt"] is None
            assert outcome["daysLate"] is None
            assert outcome["paidInFull"] is not None
            assert outcome["revisionsRequested"] is not None
            assert outcome["scopeCreepOccurred"] is not None
