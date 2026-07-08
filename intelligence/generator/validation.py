def validate_dataset(profiles, jobposts, proposals, engagements, outcomes, reviews, rings, manifest) -> dict:
    profile_ids = {p["_localId"] for p in profiles}
    jobpost_ids = {jp["_localId"] for jp in jobposts}
    engagement_ids = {e["_localId"] for e in engagements}

    orphan_proposals = sum(
        1
        for pr in proposals
        if pr["jobPostLocalId"] not in jobpost_ids or pr["freelancerProfileLocalId"] not in profile_ids
    )
    orphan_reviews = sum(1 for r in reviews if r["engagementLocalId"] not in engagement_ids)
    orphan_outcomes = sum(1 for o in outcomes if o["engagementLocalId"] not in engagement_ids)

    rings_without_reciprocity = 0
    for ring in rings:
        graph = ring["graph"]
        members = ring["memberLocalIds"]
        for member in members:
            others = [m for m in members if m != member]
            if not any(graph.has_edge(member, other) for other in others):
                rings_without_reciprocity += 1
                break

    profile_count_matches = len(manifest["profiles"]) == len(profiles)
    ring_count_matches = len(manifest["rings"]) == len(rings)

    return {
        "referentialIntegrity": {
            "orphanProposals": orphan_proposals,
            "orphanReviews": orphan_reviews,
            "orphanOutcomes": orphan_outcomes,
        },
        "ringSignatureCheck": {"ringsWithoutReciprocity": rings_without_reciprocity},
        "manifestReconciliation": {
            "profileCountMatches": profile_count_matches,
            "ringCountMatches": ring_count_matches,
        },
        "counts": {
            "profiles": len(profiles),
            "jobposts": len(jobposts),
            "proposals": len(proposals),
            "engagements": len(engagements),
            "outcomes": len(outcomes),
            "reviews": len(reviews),
            "rings": len(rings),
        },
    }
