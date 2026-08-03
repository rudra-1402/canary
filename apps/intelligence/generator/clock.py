"""The generator's single "now" instant -- never the wall clock.

Every module in the generation path used to call `datetime.utcnow()`
independently, so two runs at the same seed diverged as soon as any of those
twelve reads landed on a different moment. `resolve_now` is the one place
"now" is decided: explicit `now` always wins (this is how callers/tests pin
it so `generate(seed) == generate(seed)`); absent that, the default is
derived from `config.seed` alone, never from the wall clock, so repeated
calls with the same config are identical by construction.
"""

from datetime import datetime, timedelta

from generator.config import GeneratorConfig

# Fixed anchor for the deterministic default. Arbitrary in absolute terms --
# everything downstream only ever depends on the delta between timestamps and
# this "now", never on its calendar meaning -- but fixed so it can never
# silently reintroduce a wall-clock read.
_DEFAULT_NOW_EPOCH = datetime(2026, 1, 1)


def resolve_now(config: GeneratorConfig, now: datetime | None = None) -> datetime:
    """Resolve the run's "now" instant.

    `now`, if given, is returned unchanged -- this is how a caller (run.py, a
    test) pins the instant explicitly. Otherwise the default is
    `_DEFAULT_NOW_EPOCH` offset deterministically by `config.seed`, so calling
    this with the same config twice always returns the same instant.
    """
    if now is not None:
        return now
    return _DEFAULT_NOW_EPOCH + timedelta(days=config.seed % 3650)
