from datetime import datetime, timedelta

from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import generate_outcomes
from generator.payments import generate_payments
from generator.proposals import generate_proposals
from generator.timeline import build_timelines


def test_payments_are_generated_only_for_observed_clients_who_paid_in_full():
    config = GeneratorConfig(seed=42, num_profiles=300)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    timelines = build_timelines(config, engagements, outcomes, now=datetime.utcnow())
    payments = generate_payments(config, profiles, engagements, outcomes, timelines, now=datetime.utcnow())

    paid_client_outcome_ids = {
        outcome["engagementLocalId"]
        for outcome in outcomes
        if outcome["subjectRole"] == "client"
        and outcome["observed"]
        and not outcome["ghosted"]
        and outcome["paidInFull"]
    }

    assert paid_client_outcome_ids
    assert {payment["engagementLocalId"] for payment in payments} == paid_client_outcome_ids


def test_payment_generation_uses_the_client_outcome_not_the_last_outcome():
    created_at = datetime.utcnow() - timedelta(days=100)
    engagement = {
        "_localId": "engagement-1",
        "status": "concluded",
        "freelancerProfileLocalId": "freelancer-1",
        "clientProfileLocalId": "client-1",
        "createdAt": created_at,
        "agreedTerms": {"price": 1234, "dueAt": created_at + timedelta(days=20), "paymentTerms": "net-30"},
    }
    client_outcome = {
        "engagementLocalId": "engagement-1",
        "subjectProfileLocalId": "client-1",
        "counterpartyProfileLocalId": "freelancer-1",
        "subjectRole": "client",
        "observed": True,
        "ghosted": False,
        "paidInFull": True,
        "daysLate": 13,
        "deliveredAt": created_at + timedelta(days=13),
        "revisionsRequested": 8,
        "scopeCreepOccurred": True,
    }
    freelancer_outcome = {
        "engagementLocalId": "engagement-1",
        "subjectProfileLocalId": "freelancer-1",
        "counterpartyProfileLocalId": "client-1",
        "subjectRole": "freelancer",
        "observed": False,
        "ghosted": True,
        "paidInFull": False,
        "daysLate": 1,
        "deliveredAt": created_at + timedelta(days=1),
        "revisionsRequested": 2,
        "scopeCreepOccurred": False,
    }

    config = GeneratorConfig(seed=42)
    timelines = build_timelines(
        config, [engagement], [client_outcome, freelancer_outcome], now=datetime.utcnow()
    )
    payments = generate_payments(
        config, [], [engagement], [client_outcome, freelancer_outcome], timelines, now=datetime.utcnow()
    )

    assert len(payments) == 1
    assert payments[0]["receivedAt"] == timelines["engagement-1"]["receivedAt"]
