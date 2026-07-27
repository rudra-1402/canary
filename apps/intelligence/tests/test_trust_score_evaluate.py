import random
from datetime import datetime, timedelta

from bson import ObjectId

from trust_score.config import TrustScoreConfig
from trust_score.evaluate import SEVERITY_ORDER, evaluate_role

NOW = datetime(2026, 7, 1)


class _FakeCollection:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query=None):
        query = query or {}
        return [d for d in self._docs if all(d.get(k) == v for k, v in query.items())]


class _FakeDB:
    def __init__(self, profiles, engagements, outcomes, reviews):
        self.profiles = _FakeCollection(profiles)
        self.engagements = _FakeCollection(engagements)
        self.outcomes = _FakeCollection(outcomes)
        self.reviews = _FakeCollection(reviews)


def _make_profile(rng, role, reliable, i):
    pid = ObjectId()
    return pid, {"_id": pid, "role": role, "createdAt": NOW - timedelta(days=200)}, reliable


def _make_history(rng, profile_id, reliable, n=6):
    engagements, outcomes = [], []
    other_party = ObjectId()
    for i in range(n):
        eid = ObjectId()
        created = NOW - timedelta(days=30 * (n - i))
        engagements.append(
            {
                "_id": eid,
                "freelancerProfileId": profile_id,
                "clientProfileId": other_party,
                "status": "concluded",
                "createdAt": created,
            }
        )
        outcomes.append(
            {
                "engagementId": eid,
                "paidInFull": reliable or rng.random() < 0.2,
                "daysLate": 0 if reliable else rng.randint(5, 30),
                "scopeCreepOccurred": not reliable and rng.random() < 0.5,
                "ghosted": not reliable and rng.random() < 0.3,
                "endedAs": "completed" if reliable else rng.choice(["cancelled", "ghosted"]),
                "recordedAt": created,
            }
        )
    return engagements, outcomes


def _build_dataset(n_reliable=15, n_bad=15):
    rng = random.Random(7)
    profiles, engagements, outcomes = [], [], []
    manifest_profiles = []
    id_map = {}

    for i in range(n_reliable):
        pid, profile, _ = _make_profile(rng, "freelancer", True, i)
        profiles.append(profile)
        e, o = _make_history(rng, pid, True)
        engagements += e
        outcomes += o
        local_id = f"profile-{len(id_map)}"
        id_map[local_id] = str(pid)
        manifest_profiles.append({"profileLocalId": local_id, "trueArchetype": "reliable"})

    for i in range(n_bad):
        pid, profile, _ = _make_profile(rng, "freelancer", False, i)
        profiles.append(profile)
        e, o = _make_history(rng, pid, False)
        engagements += e
        outcomes += o
        local_id = f"profile-{len(id_map)}"
        id_map[local_id] = str(pid)
        manifest_profiles.append({"profileLocalId": local_id, "trueArchetype": "bad-actor"})

    db = _FakeDB(profiles, engagements, outcomes, [])
    manifest_by_local = {p["profileLocalId"]: p for p in manifest_profiles}
    real_to_local = {v: k for k, v in id_map.items()}
    return db, manifest_by_local, real_to_local


def test_evaluate_role_reports_positive_rank_correlation_on_separable_data():
    db, manifest_by_local, real_to_local = _build_dataset()
    config = TrustScoreConfig(min_engagements_for_scoring=1, eval_test_size=0.3)
    result = evaluate_role(db, "freelancer", config, manifest_by_local, real_to_local, now=NOW)

    assert result["test_size"] > 0
    assert result["rank_correlation"] is not None
    assert result["rank_correlation"] > 0.3
    assert result["bad_actor_precision_recall"]["planted"] > 0
    assert result["determinism_ok"] is True


def test_severity_order_excludes_planted_adversarial_roles():
    assert set(SEVERITY_ORDER.keys()) == {"bad-actor", "risky", "reliable"}
