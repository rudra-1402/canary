"""TDD for defect #6: `generate(seed)` must reproduce.

Every generator module used to read `datetime.utcnow()` directly inside the
generation path, so two runs at the same seed diverged the instant any
wall-clock read landed on a different microsecond. This is the failing test
written FIRST, before any fix: it calls the same seeded generator function
twice, with a real sleep between the calls to force the wall clock to move,
and asserts the outputs are identical. It must fail against the pre-fix code.
"""

import time

from generator.config import GeneratorConfig
from generator.identities_profiles import generate_identities_and_profiles
from generator.run import _prepare_persistence_documents, generate


def test_generate_identities_and_profiles_is_deterministic_for_same_seed():
    config = GeneratorConfig(seed=7, num_profiles=5)

    _, first_profiles = generate_identities_and_profiles(config)
    time.sleep(0.05)
    _, second_profiles = generate_identities_and_profiles(config)

    assert first_profiles == second_profiles


def _small_config(seed: int) -> GeneratorConfig:
    # Small enough to run fast in a unit test while still exercising every
    # stage of the pipeline (rings, ring-forced engagements, timelines).
    return GeneratorConfig(seed=seed, num_profiles=40, engagement_fanout_multiplier=2.0)


def test_full_pipeline_generate_is_deterministic_for_same_seed():
    """The property this whole defect is about: generate(seed) == generate(seed).

    A real sleep between the two calls forces the wall clock to move; before
    the fix this reliably diverged (twelve independent `datetime.utcnow()`
    reads across the generation path). After the fix, every timestamp is
    derived from the one `now` resolved inside `generate()` from `config`,
    never from the wall clock.
    """
    config = _small_config(seed=101)

    first = generate(config)
    time.sleep(0.05)
    second = generate(config)

    collections = (
        "identities",
        "profiles",
        "jobposts",
        "proposals",
        "engagements",
        "outcomes",
        "reviews",
        "payments",
    )
    for key in collections:
        assert first[key] == second[key], f"{key} diverged between two generate(seed) calls"
    assert first["now"] == second["now"]


def test_persistence_documents_are_byte_identical_including_object_ids():
    """Defect #6's second half: `ObjectId()` embeds wall-clock + random bytes,
    so even a fully-deterministic in-memory pipeline would still diverge at
    persistence time unless `_id` assignment is itself made deterministic.
    """
    config = _small_config(seed=202)

    first = generate(config)
    second = generate(config)

    first_documents, *_ = _prepare_persistence_documents(
        first["identities"],
        first["profiles"],
        first["jobposts"],
        first["proposals"],
        first["engagements"],
        first["outcomes"],
        first["reviews"],
        first["payments"],
        config,
    )
    second_documents, *_ = _prepare_persistence_documents(
        second["identities"],
        second["profiles"],
        second["jobposts"],
        second["proposals"],
        second["engagements"],
        second["outcomes"],
        second["reviews"],
        second["payments"],
        config,
    )

    assert first_documents == second_documents
    # Explicitly confirm _id equality, not just dict equality, so a future
    # refactor that drops "_id" from one side can't make this pass vacuously.
    assert len(first_documents["profiles"]) > 0
    first_ids = [doc["_id"] for doc in first_documents["profiles"]]
    second_ids = [doc["_id"] for doc in second_documents["profiles"]]
    assert first_ids == second_ids
