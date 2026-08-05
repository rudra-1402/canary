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


def load_profile_dataset(db, profile_id) -> dict:
    """Fetch the exact per-Profile rows that ``load_dataset`` would index."""
    profile = db.profiles.find_one({"_id": profile_id})
    if profile is None:
        raise ValueError(f"Profile {profile_id} does not exist.")

    concluded_engagements = list(
        db.engagements.find(
            {
                "status": "concluded",
                "$or": [{"freelancerProfileId": profile_id}, {"clientProfileId": profile_id}],
            }
        )
    )
    concluded_engagement_ids = {engagement["_id"] for engagement in concluded_engagements}
    concluded_engagements_by_id = {engagement["_id"]: engagement for engagement in concluded_engagements}
    outcomes = list(
        db.outcomes.find(
            {"subjectProfileId": profile_id, "engagementId": {"$in": list(concluded_engagement_ids)}}
        )
    )
    outcomes = [
        outcome
        for outcome in outcomes
        if outcome["subjectProfileId"]
        in {
            concluded_engagements_by_id[outcome["engagementId"]]["freelancerProfileId"],
            concluded_engagements_by_id[outcome["engagementId"]]["clientProfileId"],
        }
    ]
    reviews = list(db.reviews.find({"subjectProfileId": profile_id}))
    return {"profile": profile, "outcomes": outcomes, "reviews": reviews}
