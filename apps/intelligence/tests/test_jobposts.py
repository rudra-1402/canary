from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.proposals import generate_proposals


def test_jobposts_only_come_from_client_profiles():
    config = GeneratorConfig(seed=42, num_profiles=100)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    client_ids = {p["_localId"] for p in profiles if p["role"] == "client"}
    assert all(jp["clientProfileLocalId"] in client_ids for jp in jobposts)


def test_cold_start_clients_get_planted_red_flag_briefs():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    cold_start_client_ids = {
        p["_localId"] for p in profiles if p["role"] == "client" and p["trueArchetype"] == "cold-start"
    }
    cold_start_posts = [jp for jp in jobposts if jp["clientProfileLocalId"] in cold_start_client_ids]
    assert any(len(jp["plantedRedFlags"]) > 0 for jp in cold_start_posts)


def test_jobposts_never_precede_their_clients_join_date():
    config = GeneratorConfig(seed=42, num_profiles=200)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    clients_by_id = {p["_localId"]: p for p in profiles if p["role"] == "client"}
    for jp in jobposts:
        client = clients_by_id[jp["clientProfileLocalId"]]
        assert jp["createdAt"] >= client["createdAt"]


def test_engagement_fanout_knob_raises_median_engagements_for_scoreable_profiles():
    def scoreable_median(fanout_multiplier):
        config = GeneratorConfig(seed=42, num_profiles=1000, engagement_fanout_multiplier=fanout_multiplier)
        _, profiles = generate_identities_and_profiles(config)
        jobposts = generate_jobposts(config, profiles)
        proposals = generate_proposals(config, profiles, jobposts)
        engagements = generate_engagements(config, profiles, jobposts, proposals)
        counts = {profile["_localId"]: 0 for profile in profiles}
        for engagement in engagements:
            counts[engagement["freelancerProfileLocalId"]] += 1
            counts[engagement["clientProfileLocalId"]] += 1
        scoreable_counts = sorted(count for count in counts.values() if count >= 3)
        return scoreable_counts[len(scoreable_counts) // 2]

    baseline = scoreable_median(1.0)
    boosted = scoreable_median(3.0)

    assert boosted > baseline
