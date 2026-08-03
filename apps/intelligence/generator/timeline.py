import random
from datetime import datetime, timedelta

from generator.clock import resolve_now
from generator.config import GeneratorConfig

MAX_PAYMENT_DELAY_DAYS = 7
MAX_CONCLUSION_DELAY_DAYS = 7


def max_chronology_days(config: GeneratorConfig) -> int:
    """Longest span a concluded engagement's chronology can occupy past dueAt.

    engagements.py refuses to conclude an engagement unless this has elapsed.
    Derived from config, not hardcoded: raising late_days_unreliability_scale
    without widening the guard would make build_timelines raise mid-seed.
    """
    max_lateness = max(1, round(1 + config.late_days_unreliability_scale))
    return max_lateness + MAX_PAYMENT_DELAY_DAYS + MAX_CONCLUSION_DELAY_DAYS


def build_timelines(
    config: GeneratorConfig,
    engagements: list[dict],
    conduct: list[dict],
    *,
    now: datetime | None = None,
) -> dict[str, dict]:
    """Resolve the shared absolute event moments for concluded engagements.

    Conduct is deliberately relative: `daysLate` is relative to the agreed due
    date and `paidInFull` only says whether a payment occurred. This module is
    the sole place those facts become timestamps.
    """
    now = resolve_now(config, now)
    payment_rng = random.Random(config.seed + 11)
    conclusion_rng = random.Random(config.seed + 12)
    conduct_by_engagement_and_role = {
        (outcome["engagementLocalId"], outcome["subjectRole"]): outcome for outcome in conduct
    }
    timelines = {}

    for engagement in engagements:
        if engagement["status"] != "concluded":
            continue

        due_at = engagement["agreedTerms"]["dueAt"]
        freelancer_conduct = conduct_by_engagement_and_role.get((engagement["_localId"], "freelancer"))
        client_conduct = conduct_by_engagement_and_role.get((engagement["_localId"], "client"))
        days_late = freelancer_conduct["daysLate"] if freelancer_conduct else None
        delivered_at = due_at + timedelta(days=days_late) if days_late is not None else None

        received_at = None
        if client_conduct and client_conduct["paidInFull"]:
            # The payment term bounds the short, distinct payment-event draw.
            payment_days = int(engagement["agreedTerms"].get("paymentTerms", "net-30").split("-")[1])
            received_at = delivered_at + timedelta(
                days=payment_rng.randint(1, min(MAX_PAYMENT_DELAY_DAYS, payment_days))
            )

        conclusion_base = max(due_at, delivered_at or due_at, received_at or due_at)
        recorded_at = conclusion_base + timedelta(days=conclusion_rng.randint(1, MAX_CONCLUSION_DELAY_DAYS))
        if recorded_at > now:
            raise ValueError(
                f"Concluded engagement {engagement['_localId']} has insufficient elapsed time "
                "for its timeline"
            )

        timelines[engagement["_localId"]] = {
            "deliveredAt": delivered_at,
            "receivedAt": received_at,
            "recordedAt": recorded_at,
        }

    return timelines
