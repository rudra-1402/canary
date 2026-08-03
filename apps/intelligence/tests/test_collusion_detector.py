"""TDD for the Slice-2 collusion/review-ring detector.

The detector must score purely from observable review/engagement/outcome
structure. test_scoring_never_reads_planted_flags is the leakage guard: it
would fail if any code path in collusion/graph.py, collusion/signals.py or
collusion/detector.py started reading isPlantedCollusion (or anything derived
from it) while scoring.
"""

from bson import ObjectId

from collusion.detector import detect_candidate_rings, run_detector, score_profiles
from collusion.graph import build_pair_stats, build_suspect_graph
from collusion.signals import compute_profile_signals

A, B, C, D, E = (ObjectId() for _ in range(5))


def _review(*, engagement_id, author, subject, rating, is_planted_collusion=False):
    return {
        "engagementId": engagement_id,
        "authorProfileId": author,
        "subjectProfileId": subject,
        "rating": rating,
        # Present so tests can prove the detector ignores it, exactly like the
        # real Review documents carry it (generator/reviews.py).
        "isPlantedCollusion": is_planted_collusion,
        "isPlantedSabotage": False,
    }


def _dataset(reviews, outcomes_by_key=None):
    return {
        "reviews": reviews,
        "outcomes_by_engagement_and_subject": outcomes_by_key or {},
    }


def test_build_pair_stats_groups_reviews_by_unordered_pair_and_engagement():
    e1, e2 = ObjectId(), ObjectId()
    reviews = [
        _review(engagement_id=e1, author=A, subject=B, rating=5),
        _review(engagement_id=e1, author=B, subject=A, rating=5),
        _review(engagement_id=e2, author=A, subject=B, rating=3),
    ]
    stats = build_pair_stats(reviews)
    pair = frozenset((A, B))
    assert stats[pair]["engagement_ids"] == {e1, e2}
    assert stats[pair]["reciprocal_five_star_engagement_ids"] == {e1}


def test_reciprocal_five_star_requires_both_sides_and_both_fives():
    e1, e2 = ObjectId(), ObjectId()
    reviews = [
        # Only one side reviewed -- not reciprocal.
        _review(engagement_id=e1, author=A, subject=B, rating=5),
        # Both sides reviewed but one rating isn't 5.
        _review(engagement_id=e2, author=A, subject=C, rating=5),
        _review(engagement_id=e2, author=C, subject=A, rating=4),
    ]
    stats = build_pair_stats(reviews)
    assert stats[frozenset((A, B))]["reciprocal_five_star_engagement_ids"] == set()
    assert stats[frozenset((A, C))]["reciprocal_five_star_engagement_ids"] == set()


def test_suspect_graph_has_an_edge_only_for_reciprocal_five_star_pairs():
    e1 = ObjectId()
    reviews = [
        _review(engagement_id=e1, author=A, subject=B, rating=5),
        _review(engagement_id=e1, author=B, subject=A, rating=5),
        # C-D never reciprocate 5-star -- no edge.
        _review(engagement_id=ObjectId(), author=C, subject=D, rating=2),
    ]
    stats = build_pair_stats(reviews)
    graph = build_suspect_graph(stats)
    assert graph.has_edge(A, B)
    assert not graph.has_node(C) or not graph.has_edge(C, D)


def test_detect_candidate_rings_groups_a_full_mesh_into_one_component():
    # A, B, C each reciprocally 5-star each other -- a planted 3-member ring that
    # all fully transacted internally, exactly like generator/collusion_rings.py's
    # complete DiGraph over ring members.
    reviews = []
    for x, y in [(A, B), (B, C), (A, C)]:
        engagement_id = ObjectId()
        reviews.append(_review(engagement_id=engagement_id, author=x, subject=y, rating=5))
        reviews.append(_review(engagement_id=engagement_id, author=y, subject=x, rating=5))
    # D reciprocates 5-star only with an outsider E -- separate ring.
    engagement_id = ObjectId()
    reviews.append(_review(engagement_id=engagement_id, author=D, subject=E, rating=5))
    reviews.append(_review(engagement_id=engagement_id, author=E, subject=D, rating=5))

    dataset = _dataset(reviews)
    rings = detect_candidate_rings(dataset)

    sizes = sorted(ring["size"] for ring in rings)
    assert sizes == [2, 3]
    ring_of_three = next(ring for ring in rings if ring["size"] == 3)
    assert set(ring_of_three["member_profile_ids"]) == {A, B, C}
    assert ring_of_three["density"] == 1.0


def test_top_partner_share_flags_low_counterparty_diversity():
    # A reviews only B, always -- maximally concentrated on one counterparty.
    reviews = [_review(engagement_id=ObjectId(), author=A, subject=B, rating=3) for _ in range(4)]
    stats = build_pair_stats(reviews)
    signals = compute_profile_signals(_dataset(reviews), stats)
    assert signals[A]["top_partner_share"] == 1.0
    assert signals[A]["distinct_counterparties"] == 1


def test_outcome_mismatch_rate_flags_five_star_reviews_contradicted_by_outcome():
    e1, e2 = ObjectId(), ObjectId()
    reviews = [
        _review(engagement_id=e1, author=A, subject=B, rating=5),
        _review(engagement_id=e2, author=A, subject=C, rating=5),
    ]
    outcomes_by_key = {
        # B ghosted the engagement A rated 5 stars -- a mismatch.
        (e1, B): {"observed": True, "ghosted": True, "subjectRole": "freelancer", "daysLate": None},
        # C delivered on time -- consistent with the 5-star rating.
        (e2, C): {"observed": True, "ghosted": False, "subjectRole": "freelancer", "daysLate": -1},
    }
    stats = build_pair_stats(reviews)
    signals = compute_profile_signals(_dataset(reviews, outcomes_by_key), stats)
    assert signals[A]["five_star_outcome_mismatch_rate"] == 0.5


def test_score_profiles_ranks_ring_members_above_unrelated_profiles():
    e1 = ObjectId()
    ring_reviews = [
        _review(engagement_id=e1, author=A, subject=B, rating=5),
        _review(engagement_id=e1, author=B, subject=A, rating=5),
    ]
    # F, G exchange one honest 3-star review each -- no reciprocal five-star signal.
    F, G = ObjectId(), ObjectId()
    e2 = ObjectId()
    unrelated_reviews = [
        _review(engagement_id=e2, author=F, subject=G, rating=3),
        _review(engagement_id=e2, author=G, subject=F, rating=3),
    ]
    dataset = _dataset(ring_reviews + unrelated_reviews)
    scored = score_profiles(dataset)
    by_id = {row["profile_id"]: row for row in scored}

    assert by_id[A]["flagged"] is True
    assert by_id[B]["flagged"] is True
    assert by_id[F]["flagged"] is False
    assert by_id[G]["flagged"] is False
    assert by_id[A]["risk_score"] > by_id[F]["risk_score"]
    # Ranked score, not just a boolean.
    assert scored[0]["risk_score"] >= scored[-1]["risk_score"]


def test_scoring_never_reads_planted_flags():
    """The leakage guard. Two datasets are byte-identical except every review's
    isPlantedCollusion flag is flipped; if any code path in the scoring pipeline
    read that flag, the two runs would diverge. They must not."""
    e1, e2 = ObjectId(), ObjectId()
    reviews_a = [
        _review(engagement_id=e1, author=A, subject=B, rating=5, is_planted_collusion=True),
        _review(engagement_id=e1, author=B, subject=A, rating=5, is_planted_collusion=True),
        _review(engagement_id=e2, author=C, subject=D, rating=4, is_planted_collusion=False),
    ]
    reviews_b = [{**review, "isPlantedCollusion": not review["isPlantedCollusion"]} for review in reviews_a]

    scored_a = score_profiles(_dataset(reviews_a))
    scored_b = score_profiles(_dataset(reviews_b))

    by_id_a = {row["profile_id"]: row["risk_score"] for row in scored_a}
    by_id_b = {row["profile_id"]: row["risk_score"] for row in scored_b}
    assert by_id_a == by_id_b


def test_run_detector_returns_the_same_scores_and_rings_as_the_individual_calls():
    e1 = ObjectId()
    reviews = [
        _review(engagement_id=e1, author=A, subject=B, rating=5),
        _review(engagement_id=e1, author=B, subject=A, rating=5),
    ]
    dataset = _dataset(reviews)
    combined = run_detector(dataset)
    assert combined["scored"] == score_profiles(dataset)
    assert combined["rings"] == detect_candidate_rings(dataset)
