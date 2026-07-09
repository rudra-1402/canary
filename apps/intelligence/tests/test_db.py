import pytest
from generator.db import get_client


def test_get_client_raises_without_uri(monkeypatch):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    with pytest.raises(RuntimeError, match="MONGODB_URI is not set"):
        get_client(uri=None)


def test_get_database_connects_to_real_mongo(mongo_db):
    assert mongo_db.command("ping")["ok"] == 1.0
