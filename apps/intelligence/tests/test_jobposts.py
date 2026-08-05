from generator import corpus
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


# ---------------------------------------------------------------------------
# Defect: budgetOrRate was drawn independent of jobType, so an "hourly" post
# could read "$6,531 hourly" -- a fixed-price magnitude with an hourly label.
# The amount must be conditioned on jobType (and, for hourly, on
# experienceLevel), using ranges that are configurable constants rather than
# magic numbers in the loop.
# ---------------------------------------------------------------------------


def test_hourly_and_fixed_amounts_fall_in_their_own_configured_ranges():
    config = GeneratorConfig(seed=42, num_profiles=3000)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)

    hourly_posts = [jp for jp in jobposts if jp["jobType"] == "hourly"]
    fixed_posts = [jp for jp in jobposts if jp["jobType"] == "fixed"]
    assert len(hourly_posts) > 50, "batch did not produce enough hourly posts to be meaningful"
    assert len(fixed_posts) > 50, "batch did not produce enough fixed posts to be meaningful"

    for jp in hourly_posts:
        lo, hi = config.hourly_rate_ranges[jp["experienceLevel"]]
        assert lo <= jp["budgetOrRate"] <= hi, (
            f"jobpost {jp['_localId']!r} is hourly/{jp['experienceLevel']} but "
            f"budgetOrRate={jp['budgetOrRate']} is outside [{lo}, {hi}]"
        )

    for jp in fixed_posts:
        assert config.fixed_budget_min <= jp["budgetOrRate"] <= config.fixed_budget_max, (
            f"jobpost {jp['_localId']!r} is fixed but budgetOrRate={jp['budgetOrRate']} is "
            f"outside [{config.fixed_budget_min}, {config.fixed_budget_max}]"
        )

    # The two distributions must not just both happen to fit a shared wide
    # range -- fixed budgets must actually reach above the top of any hourly
    # range, and hourly rates must actually reach below the bottom of the
    # fixed range, or this test would pass against the old single-range draw.
    max_hourly_rate = max(hi for _, hi in config.hourly_rate_ranges.values())
    assert max(jp["budgetOrRate"] for jp in fixed_posts) > max_hourly_rate
    assert min(jp["budgetOrRate"] for jp in hourly_posts) < config.fixed_budget_min


# ---------------------------------------------------------------------------
# Defect: title and description each drew the deliverable noun independently
# from CATEGORY_NOUNS, so a post could title itself "CRM Setup consultant
# needed for a competitive landscape report" while its description opens "We
# need a business plan for a new venture...". Both must name the one
# deliverable chosen for that post.
# ---------------------------------------------------------------------------


def test_title_and_description_name_the_same_deliverable_across_a_batch():
    config = GeneratorConfig(seed=42, num_profiles=3000)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    assert len(jobposts) > 200

    for jp in jobposts:
        pool = [n.lower() for n in corpus.CATEGORY_NOUNS[jp["category"]]]
        title_lower = jp["title"].lower()
        description_lower = jp["description"].lower()
        nouns_in_title = {n for n in pool if n in title_lower}
        nouns_in_description = {n for n in pool if n in description_lower}
        assert nouns_in_title, f"jobpost {jp['_localId']!r} title names no known deliverable: {jp['title']!r}"
        assert (
            nouns_in_description
        ), f"jobpost {jp['_localId']!r} description names no known deliverable: {jp['description']!r}"
        assert nouns_in_title & nouns_in_description, (
            f"jobpost {jp['_localId']!r} title and description name different deliverables: "
            f"title={jp['title']!r} description={jp['description']!r}"
        )
