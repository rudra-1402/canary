def load_dataset(db) -> dict:
    """Bulk-load Profile/Engagement/Outcome/Review once and index Outcomes and
    Reviews per Profile, so per-profile feature engineering is O(1) dict
    lookups instead of one Mongo query per profile."""
    profiles = list(db.profiles.find({}))
    concluded_engagements = list(db.engagements.find({"status": "concluded"}))
    outcomes = list(db.outcomes.find({}))
    reviews = list(db.reviews.find({}))

    engagement_by_id = {e["_id"]: e for e in concluded_engagements}

    outcomes_by_profile: dict = {}
    for outcome in outcomes:
        engagement = engagement_by_id.get(outcome["engagementId"])
        if engagement is None:
            continue
        for profile_id in (engagement["freelancerProfileId"], engagement["clientProfileId"]):
            outcomes_by_profile.setdefault(profile_id, []).append(outcome)

    reviews_by_subject: dict = {}
    for review in reviews:
        reviews_by_subject.setdefault(review["subjectProfileId"], []).append(review)

    return {
        "profiles": profiles,
        "outcomes_by_profile": outcomes_by_profile,
        "reviews_by_subject": reviews_by_subject,
    }
