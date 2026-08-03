"""TDD for the behavioural collusion-ring acceptance gate.

Structural presence of ring membership was previously mistaken for rings
behaving: 402 planted colluders across 136 rings, but only 45 had even one
ring-internal engagement. judge_ring_detectability must fail exactly that
shape of defect -- ground truth present as a label, undetectable in the
actual reviewable data -- not just check that `rings` is non-empty.
"""

import pytest

from quality.gates import GateStatus, judge_ring_detectability


def _ring(local_id, members):
    return {"_localId": local_id, "memberLocalIds": members}


def _planted_review(engagement_id, author, subject):
    return {
        "engagementLocalId": engagement_id,
        "authorProfileLocalId": author,
        "subjectProfileLocalId": subject,
        "isPlantedCollusion": True,
    }


def test_not_evaluable_when_no_rings_are_planted():
    result = judge_ring_detectability([], [])
    assert result.status is GateStatus.NOT_EVALUABLE


def test_fails_when_rings_exist_but_leave_no_review_fingerprint():
    # Exactly the regression this gate exists to prevent: ring labels exist,
    # but no isPlantedCollusion review was ever produced for any member.
    rings = [_ring("ring-0", ["a", "b"]), _ring("ring-1", ["c", "d"])]
    reviews = [
        {
            "engagementLocalId": "e1",
            "authorProfileLocalId": "x",
            "subjectProfileLocalId": "y",
            "isPlantedCollusion": False,
        }
    ]
    result = judge_ring_detectability(rings, reviews)
    assert result.status is GateStatus.FAIL
    assert "member_coverage" in result.failures
    assert "ring_coverage" in result.failures


def test_fails_when_only_a_minority_of_rings_have_any_fingerprint():
    rings = [_ring(f"ring-{i}", [f"member-{i}-a", f"member-{i}-b"]) for i in range(10)]
    # Only the first ring produced a reciprocal planted review; the other 9 didn't.
    reviews = [
        _planted_review("e0", "member-0-a", "member-0-b"),
        _planted_review("e0", "member-0-b", "member-0-a"),
    ]
    result = judge_ring_detectability(rings, reviews)
    assert result.status is GateStatus.FAIL


def test_passes_when_the_large_majority_of_rings_and_members_are_fingerprinted():
    rings = [_ring(f"ring-{i}", [f"member-{i}-a", f"member-{i}-b"]) for i in range(10)]
    reviews = []
    for i in range(8):  # 8 of 10 rings, 80% -- above both floors
        reviews.append(_planted_review(f"e{i}", f"member-{i}-a", f"member-{i}-b"))
        reviews.append(_planted_review(f"e{i}", f"member-{i}-b", f"member-{i}-a"))

    result = judge_ring_detectability(rings, reviews)
    assert result.status is GateStatus.PASS


def test_ignores_non_planted_reviews_as_evidence_of_a_fingerprint():
    rings = [_ring("ring-0", ["a", "b"])]
    reviews = [
        {
            "engagementLocalId": "e1",
            "authorProfileLocalId": "a",
            "subjectProfileLocalId": "b",
            "isPlantedCollusion": False,
        },
    ]
    result = judge_ring_detectability(rings, reviews)
    assert result.status is GateStatus.FAIL


def test_gate_is_structurally_blind_to_the_planted_flag():
    """Defect #5: the gate must never read `isPlantedCollusion` while scoring
    -- it must decide purely from who-reviewed-whom, the same evidence a real,
    ground-truth-blind detector would have. Prove this two ways: (1) the flag
    can be missing entirely and the verdict is unaffected: (2) the flag's
    *value* can be flipped to whatever a generator bug might produce and the
    verdict still tracks the underlying reciprocal-review structure, not the
    flag.
    """
    rings = [_ring("ring-0", ["a", "b"]), _ring("ring-1", ["c", "d"])]

    # ring-0 is genuinely reciprocal (structurally detectable); ring-1 is not
    # (c only reviewed d once, d never reviewed c back). The flag is absent
    # for ring-0 (structurally reciprocal) and, perversely, True for ring-1
    # (non-reciprocal) -- a generator bug that mislabels a plant. A gate
    # reading the flag would get this backwards; a blind gate must not.
    reviews_without_the_flag_key = [
        {"engagementLocalId": "e0", "authorProfileLocalId": "a", "subjectProfileLocalId": "b"},
        {"engagementLocalId": "e0", "authorProfileLocalId": "b", "subjectProfileLocalId": "a"},
        {
            "engagementLocalId": "e1",
            "authorProfileLocalId": "c",
            "subjectProfileLocalId": "d",
            "isPlantedCollusion": True,
        },
    ]

    result = judge_ring_detectability(rings, reviews_without_the_flag_key)

    # ring-0's members are recoverable from structure alone (both above the
    # per-ring floor would require more rings to pass overall, so assert the
    # underlying per-member fact directly rather than the aggregate verdict).
    assert result.ranges["member_coverage"][0] == pytest.approx(0.5)  # a, b out of a, b, c, d
    assert result.status is GateStatus.FAIL  # ring-1 (c, d) never left a fingerprint
