from datetime import datetime

from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import draw_relative_conduct, generate_outcomes
from generator.payments import generate_payments
from generator.proposals import generate_proposals
from generator.timeline import build_timelines, max_chronology_days


def _timeline_dataset(num_profiles=300):
    config = GeneratorConfig(seed=42, num_profiles=num_profiles)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    now = datetime.utcnow()
    conduct = draw_relative_conduct(config, profiles, engagements, now=now)
    timelines = build_timelines(config, engagements, conduct, now=now)
    outcomes = generate_outcomes(config, profiles, engagements, conduct=conduct, timelines=timelines, now=now)
    payments = generate_payments(config, profiles, engagements, conduct, timelines, now=now)
    return now, engagements, conduct, timelines, outcomes, payments


def test_timeline_keeps_every_concluded_engagement_chronologically_coherent():
    now, engagements, _, timelines, outcomes, payments = _timeline_dataset(num_profiles=2000)
    outcomes_by_engagement = {}
    for outcome in outcomes:
        outcomes_by_engagement.setdefault(outcome["engagementLocalId"], []).append(outcome)
    payments_by_engagement = {payment["engagementLocalId"]: payment for payment in payments}

    concluded_engagements = [engagement for engagement in engagements if engagement["status"] == "concluded"]
    assert concluded_engagements
    assert set(outcomes_by_engagement) == {engagement["_localId"] for engagement in concluded_engagements}
    for engagement in concluded_engagements:
        event_times = timelines[engagement["_localId"]]
        assert engagement["createdAt"] < engagement["agreedTerms"]["dueAt"]
        assert engagement["createdAt"] < event_times["recordedAt"] <= now
        for event_name in ("deliveredAt", "receivedAt"):
            if event_times[event_name] is not None:
                assert engagement["createdAt"] < event_times[event_name] <= now
        if engagement["_localId"] in payments_by_engagement:
            assert payments_by_engagement[engagement["_localId"]]["receivedAt"] == event_times["receivedAt"]


def test_conclusion_guard_tracks_the_lateness_config():
    """engagements.py refuses to conclude an engagement until the full chronology
    could have elapsed. That budget must be DERIVED from config — a hardcoded
    span silently under-reserves when late_days_unreliability_scale is raised,
    and build_timelines then raises mid-seed rather than at review time."""
    base = GeneratorConfig(seed=42)
    widened = GeneratorConfig(seed=42, late_days_unreliability_scale=base.late_days_unreliability_scale * 3)

    assert max_chronology_days(widened) > max_chronology_days(base)
    # The budget must cover the worst case the draw can actually produce:
    # maximum lateness, plus a payment event, plus a conclusion event.
    for config in (base, widened):
        worst_lateness = max(1, round(1 + config.late_days_unreliability_scale))
        assert max_chronology_days(config) >= worst_lateness + 14


def test_widened_lateness_config_does_not_break_the_timeline():
    """The guard and build_timelines must stay in agreement under a changed
    config — this is the failure the derivation above exists to prevent."""
    config = GeneratorConfig(seed=42, num_profiles=300, late_days_unreliability_scale=45)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    now = datetime.utcnow()
    conduct = draw_relative_conduct(config, profiles, engagements, now=now)

    # Must not raise "insufficient elapsed time".
    timelines = build_timelines(config, engagements, conduct, now=now)
    assert timelines


def test_outcomes_and_payments_consume_the_same_timeline_event_times():
    _, engagements, _, timelines, outcomes, payments = _timeline_dataset()
    engagements_by_id = {engagement["_localId"]: engagement for engagement in engagements}
    outcomes_by_engagement = {}
    for outcome in outcomes:
        outcomes_by_engagement.setdefault(outcome["engagementLocalId"], []).append(outcome)

    for engagement_id, engagement_outcomes in outcomes_by_engagement.items():
        event_times = timelines[engagement_id]
        assert {outcome["recordedAt"] for outcome in engagement_outcomes} == {event_times["recordedAt"]}
        freelancer_outcome = next(
            outcome for outcome in engagement_outcomes if outcome["subjectRole"] == "freelancer"
        )
        if freelancer_outcome["deliveredAt"] is not None:
            assert freelancer_outcome["deliveredAt"] == event_times["deliveredAt"]
            assert (
                freelancer_outcome["daysLate"]
                == (
                    event_times["deliveredAt"] - engagements_by_id[engagement_id]["agreedTerms"]["dueAt"]
                ).days
            )

    for payment in payments:
        assert payment["receivedAt"] == timelines[payment["engagementLocalId"]]["receivedAt"]
