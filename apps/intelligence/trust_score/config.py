from dataclasses import dataclass


@dataclass
class TrustScoreConfig:
    seed: int = 42
    timeline_months: int = 18

    # Below this many concluded Engagements, a Profile's feature estimates are
    # too noisy to trust (e.g. a 1-engagement paid-in-full rate is either 0%
    # or 100%, not a real estimate) -- these profiles get the cold-start path
    # instead of a model prediction (design spec's Error handling section).
    min_engagements_for_scoring: int = 3

    ewma_halflife_months: float = 3.0

    xgb_n_estimators: int = 100
    xgb_max_depth: int = 4
    xgb_learning_rate: float = 0.1

    # Held-out fraction for evaluate.py's train/test split. Not used by the
    # production pipeline (run.py trains on all available profiles).
    eval_test_size: float = 0.25
