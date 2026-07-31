def persist_trust_score(db, profile_id, snapshot: dict):
    """Persist a TrustScore snapshot and its linked RiskSignal documents.

    Raw pymongo inserts bypass Mongoose timestamps/defaults, so createdAt is
    explicitly set to the snapshot's generatedAt.

    score/level are written only for a "scored" snapshot -- an insufficient-history
    row must not carry a score-shaped value, and the Mongoose schema rejects one.
    """
    trust_score_doc = {
        "profileId": profile_id,
        "status": snapshot["status"],
        "generatedAt": snapshot["generatedAt"],
        "createdAt": snapshot["generatedAt"],
    }
    if snapshot["status"] == "scored":
        trust_score_doc["score"] = snapshot["score"]
        trust_score_doc["level"] = snapshot["level"]
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
