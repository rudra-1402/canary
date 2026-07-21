import json

from bson import ObjectId

from generator.id_map import write_id_map


def test_write_id_map_serializes_object_ids_as_strings(tmp_path):
    mapping = {"profile-0": ObjectId(), "profile-1": ObjectId()}
    out_path = tmp_path / "id-map.json"
    write_id_map(str(out_path), mapping)
    with open(out_path) as f:
        loaded = json.load(f)
    assert loaded == {k: str(v) for k, v in mapping.items()}
