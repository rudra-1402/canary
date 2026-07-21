def persist_trust_score(db, profile_id, snapshot: dict):
    """Persist a TrustScore snapshot and its linked RiskSignal documents.

    Raw pymongo inserts bypass Mongoose timestamps/defaults, so createdAt is
    explicitly set to the snapshot's generatedAt.
    """
    trust_score_doc = {
        "profileId": profile_id,
        "score": snapshot["score"],
        "level": snapshot["level"],
        "generatedAt": snapshot["generatedAt"],
        "createdAt": snapshot["generatedAt"],
    }
    result = db.trustscores.insert_one(trust_score_doc)
    trust_score_id = result.inserted_id

    for signal in snapshot["riskSignals"]:
        db.risksignals.insert_one(
            {
                "parentType": "TrustScore",
                "parentId": trust_score_id,
                "name": signal["name"],
                "value": signal["value"],
                "direction": signal["direction"],
                "source": signal["source"],
                "sourceBriefAnalysisId": None,
                "createdAt": snapshot["generatedAt"],
            }
        )

    return trust_score_id
