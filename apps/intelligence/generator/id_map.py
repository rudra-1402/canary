import json


def write_id_map(path: str, profile_local_to_real: dict) -> None:
    """Persist the profileLocalId -> real Mongo ObjectId mapping computed
    during seeding, so evaluation code can join the ground-truth manifest
    (keyed by profileLocalId) against live Profile documents (keyed by real
    _id) after the fact. profile_local_to_real values may be ObjectId or str."""
    serializable = {local_id: str(real_id) for local_id, real_id in profile_local_to_real.items()}
    with open(path, "w") as f:
        json.dump(serializable, f, indent=2)
