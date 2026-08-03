"""Per-profile collusion-risk signals computed only from observable structure:
review pairs, engagement outcomes, and counterparty spread. No planted flag is
read here -- ``dataset`` (collusion/fetch.py) never carries one.
"""

from __future__ import annotations

from collections import defaultdict


def _conduct_is_bad(outcome: dict | None) -> bool:
    """Whether a recorded Outcome contradicts a 5-star review of its subject.

    Independent, evaluation-agnostic reimplementation of the generator's own good-
    conduct check (generator/reviews.py:_subject_conduct_is_good), inverted and
    applied to real Outcome documents rather than generator-internal dicts.
    """
    if outcome is None or not outcome.get("observed", True):
        return False
    if outcome.get("ghosted"):
        return True
    if outcome.get("subjectRole") == "freelancer":
        days_late = outcome.get("daysLate")
        return days_late is not None and days_late > 0
    return outcome.get("paidInFull") is False or outcome.get("scopeCreepOccurred") is True


def compute_profile_signals(dataset: dict, pair_stats: dict[frozenset, dict]) -> dict:
    """Build one signal row per profile that appears in any review pair.

    Signals:
      - top_partner_share: share of a profile's review-bearing engagements spent
        with its single most frequent counterparty (low counterparty diversity
        relative to engagement count).
      - reciprocal_five_star_rate: share of those engagements that were reciprocal
        5-star exchanges.
      - five_star_outcome_mismatch_rate: of the profile's own 5-star reviews about
        others, the share whose recorded Outcome contradicts that rating.
    """
    reviews = dataset["reviews"]
    outcomes_by_engagement_and_subject = dataset["outcomes_by_engagement_and_subject"]

    partner_engagement_counts: dict = defaultdict(dict)
    reciprocal_five_star_count: dict = defaultdict(int)
    total_engagement_count: dict = defaultdict(int)

    for pair, stats in pair_stats.items():
        profile_a, profile_b = tuple(pair)
        engagement_total = len(stats["engagement_ids"])
        partner_engagement_counts[profile_a][profile_b] = engagement_total
        partner_engagement_counts[profile_b][profile_a] = engagement_total
        total_engagement_count[profile_a] += engagement_total
        total_engagement_count[profile_b] += engagement_total

        reciprocal_count = len(stats["reciprocal_five_star_engagement_ids"])
        if reciprocal_count:
            reciprocal_five_star_count[profile_a] += reciprocal_count
            reciprocal_five_star_count[profile_b] += reciprocal_count

    five_star_reviews_by_author: dict = defaultdict(list)
    for review in reviews:
        if review["rating"] == 5:
            five_star_reviews_by_author[review["authorProfileId"]].append(review)

    mismatch_by_author: dict = {}
    for author, five_star_reviews in five_star_reviews_by_author.items():
        mismatched = sum(
            1
            for review in five_star_reviews
            if _conduct_is_bad(
                outcomes_by_engagement_and_subject.get((review["engagementId"], review["subjectProfileId"]))
            )
        )
        mismatch_by_author[author] = (mismatched, len(five_star_reviews))

    profile_ids = set(total_engagement_count) | set(five_star_reviews_by_author)
    signals = {}
    for profile_id in profile_ids:
        total = total_engagement_count.get(profile_id, 0)
        partners = partner_engagement_counts.get(profile_id, {})
        mismatched, five_star_total = mismatch_by_author.get(profile_id, (0, 0))
        signals[profile_id] = {
            "total_review_engagements": total,
            "distinct_counterparties": len(partners),
            "top_partner_share": (max(partners.values()) / total) if total else 0.0,
            "reciprocal_five_star_count": reciprocal_five_star_count.get(profile_id, 0),
            "reciprocal_five_star_rate": (
                (reciprocal_five_star_count.get(profile_id, 0) / total) if total else 0.0
            ),
            "five_star_review_count": five_star_total,
            "five_star_outcome_mismatch_rate": (mismatched / five_star_total) if five_star_total else 0.0,
        }
    return signals
