"""Read-only loader for the collusion detector's observable inputs.

The projection on ``db.reviews.find`` deliberately excludes ``isPlantedCollusion``
and ``isPlantedSabotage`` -- those flags are evaluation-only ground truth and must
never reach the scoring path (see collusion/evaluate.py, which loads them
separately, after scoring is complete).
"""

REVIEW_PROJECTION = {
    "isPlantedCollusion": 0,
    "isPlantedSabotage": 0,
}


def load_pair_dataset(db) -> dict:
    """Bulk-load the Review/Engagement/Outcome/Profile rows the detector scores from.

    Read-only: no collection is written to or wiped.
    """
    reviews = list(db.reviews.find({}, REVIEW_PROJECTION))
    engagements = list(db.engagements.find({"status": "concluded"}))
    outcomes = list(db.outcomes.find({}))
    profiles = list(db.profiles.find({}, {"_id": 1, "role": 1}))

    outcomes_by_engagement_and_subject = {
        (outcome["engagementId"], outcome["subjectProfileId"]): outcome for outcome in outcomes
    }
    engagements_by_id = {engagement["_id"]: engagement for engagement in engagements}

    return {
        "reviews": reviews,
        "engagements": engagements,
        "engagements_by_id": engagements_by_id,
        "outcomes_by_engagement_and_subject": outcomes_by_engagement_and_subject,
        "profiles": profiles,
    }
