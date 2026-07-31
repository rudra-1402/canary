import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import os

import pytest

# Captured BEFORE importing generator.db, which calls load_dotenv() at import time and
# injects .env's MONGODB_URI (the developer's real seeded database) into os.environ.
# Read after that import, os.environ.get("MONGODB_URI", <test default>) can never fall
# back to its default -- so the whole suite silently targeted canary_dev, and a test that
# calls delete_many({}) wiped 484 500 real snapshots. The default was dead code.
_EXPLICIT_URI = os.environ.get("MONGODB_URI")

from generator.db import close_client, get_client  # noqa: E402

DEFAULT_TEST_URI = "mongodb://127.0.0.1:27017/canary_test"
DOTENV_URI = os.environ.get("MONGODB_URI")


@pytest.fixture
def mongo_client():
    """A MongoClient closed automatically at teardown. Use this (or mongo_db)
    in any test that needs a live connection, instead of calling get_client()
    directly — prevents connections accumulating across the test suite."""
    uri = _EXPLICIT_URI or DEFAULT_TEST_URI
    # Strict on purpose, including when set deliberately: tests call delete_many({}), and
    # .env's database is the one holding the real 20 000-profile seed.
    if DOTENV_URI and uri == DOTENV_URI:
        pytest.exit(
            f"Refusing to run tests against {uri} — that is .env's database. These tests "
            "delete collections. Point MONGODB_URI at a scratch database.",
            returncode=1,
        )
    client = get_client(uri)
    yield client
    close_client(client)


@pytest.fixture
def mongo_db(mongo_client):
    yield mongo_client.get_default_database()
