from datetime import datetime, timedelta

from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import generate_outcomes
from generator.payments import generate_payments
from generator.proposals import generate_proposals


def test_payments_are_not_generated_until_payment_conduct_is_implemented():
    config = GeneratorConfig(seed=42, num_profiles=300)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    payments = generate_payments(config, profiles, engagements, outcomes)

    assert payments == []


def test_payment_generation_uses_the_client_outcome_not_the_last_outcome():
    created_at = datetime.utcnow() - timedelta(days=100)
    engagement = {
        "_localId": "engagement-1",
        "freelancerProfileLocalId": "freelancer-1",
        "clientProfileLocalId": "client-1",
        "createdAt": created_at,
        "agreedTerms": {"price": 1234},
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

    payments = generate_payments(
        GeneratorConfig(seed=42), [], [engagement], [client_outcome, freelancer_outcome]
    )

    assert len(payments) == 1
    assert payments[0]["receivedAt"] == created_at + timedelta(days=43)
