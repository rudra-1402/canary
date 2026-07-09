import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import os
import pytest
from generator.db import get_client, close_client


@pytest.fixture
def mongo_client():
    """A MongoClient closed automatically at teardown. Use this (or mongo_db)
    in any test that needs a live connection, instead of calling get_client()
    directly — prevents connections accumulating across the test suite."""
    uri = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017/canary_test")
    client = get_client(uri)
    yield client
    close_client(client)


@pytest.fixture
def mongo_db(mongo_client):
    yield mongo_client.get_default_database()
