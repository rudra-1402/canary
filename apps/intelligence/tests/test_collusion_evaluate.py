import json

from bson import ObjectId

from collusion.evaluate import evaluate_detector, load_ground_truth, random_baseline


def _scored(profile_id, *, flagged, risk_score=0.5):
    return {"profile_id": profile_id, "risk_score": risk_score, "flagged": flagged, "signals": {}}


def test_evaluate_detector_reports_precision_recall_and_raw_counts():
    colluder_1, colluder_2, innocent = ObjectId(), ObjectId(), ObjectId()
    false_positive = ObjectId()
    scored = [
        _scored(colluder_1, flagged=True),
        _scored(colluder_2, flagged=False),  # planted but missed
        _scored(innocent, flagged=False),
        _scored(false_positive, flagged=True),
    ]
    colluders = {colluder_1, colluder_2}

    result = evaluate_detector(scored, colluders)

    assert result.planted_n == 2
    assert result.flagged_n == 2
    assert result.caught_n == 1
    assert result.false_positive_n == 1
    assert result.precision == 0.5
    assert result.recall == 0.5


def test_evaluate_detector_precision_is_none_when_nothing_is_flagged():
    result = evaluate_detector([_scored(ObjectId(), flagged=False)], {ObjectId()})
    assert result.flagged_n == 0
    assert result.precision is None
    assert result.recall == 0.0


def test_detectable_ceiling_recall_only_counts_colluders_who_could_be_caught():
    caught_colluder, uncaught_colluder, undetectable_colluder = (ObjectId() for _ in range(3))
    scored = [
        _scored(caught_colluder, flagged=True),
        _scored(uncaught_colluder, flagged=False),
    ]
    colluders = {caught_colluder, uncaught_colluder, undetectable_colluder}
    # undetectable_colluder never appears in the detectable set at all -- its
    # ring never transacted, so no detector could have caught it.
    detectable = {caught_colluder, uncaught_colluder}

    result = evaluate_detector(scored, colluders, detectable)

    assert result.detectable_ceiling_n == 2
    assert result.detectable_recall == 0.5
    # Full-population recall is strictly lower -- 1 out of 3 planted colluders.
    assert result.recall == 1 / 3


def test_random_baseline_draws_the_same_number_flagged_from_the_scored_population():
    population = [ObjectId() for _ in range(50)]
    colluders = set(population[:5])
    scored = [_scored(profile_id, flagged=False) for profile_id in population]

    baseline = random_baseline(scored, colluders, flagged_n=10, seed=7)

    assert baseline.flagged_n == 10
    assert baseline.planted_n == 5
    assert 0 <= baseline.caught_n <= 5


def test_random_baseline_is_deterministic_for_a_fixed_seed():
    population = [ObjectId() for _ in range(30)]
    colluders = set(population[:6])
    scored = [_scored(profile_id, flagged=False) for profile_id in population]

    first = random_baseline(scored, colluders, flagged_n=8, seed=99)
    second = random_baseline(scored, colluders, flagged_n=8, seed=99)
    assert first == second


def test_load_ground_truth_maps_local_manifest_ids_through_the_id_map(tmp_path):
    real_a, real_b = str(ObjectId()), str(ObjectId())
    manifest_path = tmp_path / "manifest.json"
    id_map_path = tmp_path / "id-map.json"
    manifest_path.write_text(
        json.dumps(
            {
                "profiles": [
                    {"profileLocalId": "profile-0", "isColluder": True},
                    {"profileLocalId": "profile-1", "isColluder": False},
                ],
                "rings": [{"ringLocalId": "ring-0", "memberLocalIds": ["profile-0"]}],
            }
        )
    )
    id_map_path.write_text(json.dumps({"profile-0": real_a, "profile-1": real_b}))

    ground_truth = load_ground_truth(manifest_path, id_map_path)

    from bson import ObjectId as OID

    assert ground_truth["colluder_profile_ids"] == {OID(real_a)}
    assert ground_truth["num_rings"] == 1
