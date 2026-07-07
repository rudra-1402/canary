import os
import pytest
from generator.db import get_client, get_database


def test_get_client_raises_without_uri(monkeypatch):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    with pytest.raises(RuntimeError, match="MONGODB_URI is not set"):
        get_client(uri=None)


def test_get_database_connects_to_real_mongo():
    uri = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017/canary_test")
    db = get_database(uri)
    assert db.command("ping")["ok"] == 1.0
