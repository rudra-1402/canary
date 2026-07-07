import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()


def get_client(uri: str | None = None) -> MongoClient:
    uri = uri if uri is not None else os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is not set")
    return MongoClient(uri)


def get_database(uri: str | None = None):
    client = get_client(uri)
    return client.get_default_database()
