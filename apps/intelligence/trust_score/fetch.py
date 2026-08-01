def load_dataset(db) -> dict:
    """Bulk-load Profile/Engagement/Outcome/Review once and index Outcomes and
    Reviews per Profile, so per-profile feature engineering is O(1) dict
    lookups instead of one Mongo query per profile."""
    profiles = list(db.profiles.find({}))
    concluded_engagements = list(db.engagements.find({"status": "concluded"}))
    outcomes = list(db.outcomes.find({}))
    reviews = list(db.reviews.find({}))

    concluded_engagements_by_id = {engagement["_id"]: engagement for engagement in concluded_engagements}
    profile_ids = {profile["_id"] for profile in profiles}

    outcomes_by_profile: dict = {}
    for outcome in outcomes:
        engagement = concluded_engagements_by_id.get(outcome["engagementId"])
        if engagement is None:
            continue
        subject_profile_id = outcome.get("subjectProfileId")
        if subject_profile_id not in profile_ids or subject_profile_id not in {
            engagement["freelancerProfileId"],
            engagement["clientProfileId"],
        }:
            continue
        outcomes_by_profile.setdefault(subject_profile_id, []).append(outcome)

    reviews_by_subject: dict = {}
    for review in reviews:
        reviews_by_subject.setdefault(review["subjectProfileId"], []).append(review)

    return {
        "profiles": profiles,
        "outcomes_by_profile": outcomes_by_profile,
        "reviews_by_subject": reviews_by_subject,
    }
