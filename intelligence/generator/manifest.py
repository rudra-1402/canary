from generator.config import GeneratorConfig


def build_manifest(
    config: GeneratorConfig,
    profiles: list[dict],
    jobposts: list[dict],
    engagements: list[dict],
    reviews: list[dict],
    rings: list[dict],
    outcomes: list[dict],
) -> dict:
    ring_membership = {m: ring["_localId"] for ring in rings for m in ring["memberLocalIds"]}

    profile_records = []
    for p in profiles:
        profile_records.append(
            {
                "profileLocalId": p["_localId"],
                "trueArchetype": p["trueArchetype"],
                "isColluder": p["trueArchetype"] == "colluder",
                "ringId": ring_membership.get(p["_localId"]),
                "isBadActor": p["trueArchetype"] == "bad-actor",
                "isColdStart": p["trueArchetype"] == "cold-start",
                "isSaboteur": p["trueArchetype"] == "saboteur",
                "traitTrajectory": p["_traitTrajectory"],
                "joinMonthIndex": p["_joinMonthIndex"],
            }
        )

    ring_records = [
        {"ringLocalId": r["_localId"], "memberLocalIds": r["memberLocalIds"], "type": "positive-collusion"}
        for r in rings
    ]

    engagement_records = [
        {
            "engagementLocalId": e["_localId"],
            "badTerms": e.get("badTerms", False),
        }
        for e in engagements
    ]

    jobpost_records = [
        {"jobPostLocalId": jp["_localId"], "plantedRedFlags": jp.get("plantedRedFlags", [])}
        for jp in jobposts
    ]

    return {
        "config": {"seed": config.seed, "num_profiles": config.num_profiles},
        "profiles": profile_records,
        "rings": ring_records,
        "engagements": engagement_records,
        "jobposts": jobpost_records,
    }
