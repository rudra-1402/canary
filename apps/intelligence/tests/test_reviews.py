from datetime import datetime, timedelta

from generator import reviews as reviews_module
from generator.collusion_rings import build_collusion_rings
from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import generate_outcomes
from generator.proposals import generate_proposals
from generator.reviews import generate_reviews


def _setup(num_profiles=1000):
    config = GeneratorConfig(seed=42, num_profiles=num_profiles)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    rings = build_collusion_rings(config, profiles)
    return config, profiles, engagements, outcomes, rings


def test_reviews_are_at_most_two_per_engagement():
    config, profiles, engagements, outcomes, rings = _setup()
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    counts = {}
    for r in reviews:
        counts[r["engagementLocalId"]] = counts.get(r["engagementLocalId"], 0) + 1
    assert all(c <= 2 for c in counts.values())


def test_colluder_reviews_are_five_star_between_real_ring_counterparties():
    config, profiles, engagements, outcomes, rings = _setup()
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    colluder_reviews = [r for r in reviews if r.get("isPlantedCollusion")]
    engagement_by_id = {engagement["_localId"]: engagement for engagement in engagements}
    ring_member_ids = {member for ring in rings for member in ring["memberLocalIds"]}

    assert len(colluder_reviews) > 0
    for review in colluder_reviews:
        engagement = engagement_by_id[review["engagementLocalId"]]
        parties = {
            engagement["freelancerProfileLocalId"],
            engagement["clientProfileLocalId"],
        }
        assert review["rating"] == 5
        assert {review["authorProfileLocalId"], review["subjectProfileLocalId"]} == parties
        assert parties <= ring_member_ids


def _subject_conduct_is_good(outcome):
    if not outcome["observed"] or outcome["ghosted"]:
        return False
    if outcome["subjectRole"] == "freelancer":
        return outcome["daysLate"] is not None and outcome["daysLate"] <= 0
    return outcome["paidInFull"] is True and outcome["scopeCreepOccurred"] is False


def test_saboteur_reviews_target_real_counterparties_and_contradict_observed_good_conduct():
    config, profiles, engagements, outcomes, rings = _setup(num_profiles=5000)
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    saboteur_reviews = [review for review in reviews if review["isPlantedSabotage"]]
    engagement_by_id = {engagement["_localId"]: engagement for engagement in engagements}
    outcomes_by_engagement_and_subject = {
        (outcome["engagementLocalId"], outcome["subjectProfileLocalId"]): outcome for outcome in outcomes
    }

    assert len(saboteur_reviews) >= 30
    for review in saboteur_reviews:
        engagement = engagement_by_id[review["engagementLocalId"]]
        parties = {
            engagement["freelancerProfileLocalId"],
            engagement["clientProfileLocalId"],
        }
        subject_outcome = outcomes_by_engagement_and_subject[
            (review["engagementLocalId"], review["subjectProfileLocalId"])
        ]
        assert review["subjectProfileLocalId"] in parties
        assert review["authorProfileLocalId"] == (parties - {review["subjectProfileLocalId"]}).pop()
        assert review["rating"] <= 3
        assert subject_outcome["observed"] is True
        assert _subject_conduct_is_good(subject_outcome)


def test_sabotage_population_is_non_vacuous_and_ratings_are_diverse_across_seeds():
    sabotage_counts = []

    for seed in range(5):
        config = GeneratorConfig(seed=seed, num_profiles=5000)
        _, profiles = generate_identities_and_profiles(config)
        jobposts = generate_jobposts(config, profiles)
        proposals = generate_proposals(config, profiles, jobposts)
        engagements = generate_engagements(config, profiles, jobposts, proposals)
        outcomes = generate_outcomes(config, profiles, engagements)
        rings = build_collusion_rings(config, profiles)
        reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
        saboteur_reviews = [review for review in reviews if review["isPlantedSabotage"]]
        saboteur_ids = {profile["_localId"] for profile in profiles if profile["trueArchetype"] == "saboteur"}
        saboteur_party_engagements = [
            engagement
            for engagement in engagements
            if saboteur_ids & {engagement["freelancerProfileLocalId"], engagement["clientProfileLocalId"]}
        ]

        sabotage_counts.append(len(saboteur_reviews))
        assert len(saboteur_reviews) >= 30
        assert len(saboteur_reviews) / len(saboteur_party_engagements) >= 0.015
        assert len({review["rating"] for review in saboteur_reviews}) >= 3

    assert min(sabotage_counts) >= 30


def test_review_ratings_use_the_reviewed_subjects_outcome(monkeypatch):
    created_at = datetime.utcnow() - timedelta(days=60)
    engagement = {
        "_localId": "engagement-1",
        "freelancerProfileLocalId": "freelancer-1",
        "clientProfileLocalId": "client-1",
        "status": "concluded",
        "createdAt": created_at,
    }
    client_outcome = {
        "engagementLocalId": "engagement-1",
        "subjectProfileLocalId": "client-1",
        "counterpartyProfileLocalId": "freelancer-1",
        "subjectRole": "client",
        "observed": True,
        "ghosted": True,
        "paidInFull": False,
        "daysLate": 17,
        "deliveredAt": created_at + timedelta(days=17),
        "revisionsRequested": 9,
        "scopeCreepOccurred": True,
    }
    freelancer_outcome = {
        "engagementLocalId": "engagement-1",
        "subjectProfileLocalId": "freelancer-1",
        "counterpartyProfileLocalId": "client-1",
        "subjectRole": "freelancer",
        "observed": False,
        "ghosted": False,
        "paidInFull": True,
        "daysLate": 0,
        "deliveredAt": created_at,
        "revisionsRequested": 1,
        "scopeCreepOccurred": False,
    }
    monkeypatch.setattr(reviews_module, "_sample_rating", lambda _rng, ghosted: 1 if ghosted else 5)

    reviews = generate_reviews(
        GeneratorConfig(seed=0),
        [],
        [engagement],
        [client_outcome, freelancer_outcome],
        [],
        timelines={"engagement-1": {"recordedAt": created_at + timedelta(days=20)}},
        now=datetime.utcnow(),
    )

    ratings_by_subject = {review["subjectProfileLocalId"]: review["rating"] for review in reviews}
    assert ratings_by_subject == {"client-1": 1, "freelancer-1": 5}
