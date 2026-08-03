"""TDD for the lorem-text defect: job titles/descriptions/reviews/cover
letters were `fake.job()` / `fake.paragraph()` / `fake.sentence()` -- text
unrelated to the record it sits on ("Cytogeneticist" as a freelance job
title, "Recent century leg public society." as a brief). These tests are
written against the target behaviour (an authored corpus composed from the
document's own fields) and must fail against the pre-fix generator.
"""

import random

from generator import corpus
from generator.collusion_rings import build_collusion_rings
from generator.config import GeneratorConfig
from generator.engagements import generate_engagements
from generator.identities_profiles import generate_identities_and_profiles
from generator.jobposts import generate_jobposts
from generator.outcomes import generate_outcomes
from generator.proposals import generate_proposals
from generator.reviews import generate_reviews

ALL_SKILLS = list(corpus.SKILL_LABELS)
ALL_CATEGORIES = corpus.CATEGORIES


def _setup(seed=42, num_profiles=2000):
    config = GeneratorConfig(seed=seed, num_profiles=num_profiles)
    _, profiles = generate_identities_and_profiles(config)
    jobposts = generate_jobposts(config, profiles)
    proposals = generate_proposals(config, profiles, jobposts)
    engagements = generate_engagements(config, profiles, jobposts, proposals)
    outcomes = generate_outcomes(config, profiles, engagements)
    rings = build_collusion_rings(config, profiles)
    reviews = generate_reviews(config, profiles, engagements, outcomes, rings)
    return config, profiles, jobposts, proposals, engagements, outcomes, reviews


# ---------------------------------------------------------------------------
# Titles / descriptions never mention a skill absent from the document.
# ---------------------------------------------------------------------------


def test_skill_labels_are_pairwise_non_substrings_within_a_category():
    """Guards the "never mentions an unrelated skill" checks below. A single
    job post only ever draws skills from one category's pool (see
    test_jobpost_skills_are_always_drawn_from_the_posts_own_category), so the
    only collision that could ever surface in real data is between two
    skills that share a category -- e.g. "SEO" would be a real problem if it
    were a substring of another *marketing* skill's label. Cross-category
    collisions such as React/React Native can never co-occur in one document
    and are not checked here.
    """
    for category, skill_ids in corpus.CATEGORY_SKILLS.items():
        labels = [corpus.SKILL_LABELS[s] for s in skill_ids]
        for i, label_a in enumerate(labels):
            for j, label_b in enumerate(labels):
                if i == j:
                    continue
                assert (
                    label_a.lower() not in label_b.lower()
                ), f"in category {category!r}: {label_a!r} is a substring of {label_b!r}"


def test_jobpost_skills_are_always_drawn_from_the_posts_own_category():
    """The coherence defect: category and skills used to be two independent
    draws, so a "design" post could get "python" + "node". Skills must come
    from the category's own pool."""
    _, _, jobposts, *_ = _setup()
    assert len(jobposts) > 100
    for jobpost in jobposts:
        pool = set(corpus.CATEGORY_SKILLS[jobpost["category"]])
        assert set(jobpost["skills"]) <= pool, (
            f"jobpost {jobpost['_localId']} category={jobpost['category']!r} has "
            f"out-of-pool skills {jobpost['skills']}"
        )


def test_jobpost_skill_count_varies():
    """A fixed skill count (always exactly 2) is itself a visible tell on a
    list screen."""
    _, _, jobposts, *_ = _setup()
    counts = {len(jp["skills"]) for jp in jobposts}
    assert len(counts) >= 3, f"skill counts barely vary: {counts}"


def test_job_title_never_mentions_an_unrelated_skill():
    """ "Unrelated" is scoped to the post's own category pool: skills are
    always sampled from within one category (see
    test_jobpost_skills_are_always_drawn_from_the_posts_own_category), so a
    skill from a different category can never legitimately be a candidate
    for confusion in the first place."""
    rng = random.Random(1)
    for category in ALL_CATEGORIES:
        pool = corpus.CATEGORY_SKILLS[category]
        skill_combos = [pool[:1], pool[:2], pool[1:3] if len(pool) > 2 else pool[:2]]
        for skills in skill_combos:
            for _ in range(20):
                noun = corpus.choose_deliverable_noun(rng, category)
                title = corpus.compose_job_title(rng, category, skills, noun)
                absent_skills = [s for s in pool if s not in skills]
                for absent in absent_skills:
                    label = corpus.SKILL_LABELS[absent]
                    assert label.lower() not in title.lower(), (
                        f"title {title!r} mentions unrelated skill label {label!r} " f"for skills={skills}"
                    )


def test_job_description_never_mentions_an_unrelated_skill():
    rng = random.Random(2)
    for category in ALL_CATEGORIES:
        pool = corpus.CATEGORY_SKILLS[category]
        skill_combos = [pool[:1], pool[:2], pool[1:3] if len(pool) > 2 else pool[:2]]
        for skills in skill_combos:
            for _ in range(20):
                noun = corpus.choose_deliverable_noun(rng, category)
                description = corpus.compose_job_description(
                    rng,
                    category=category,
                    skills=skills,
                    job_type=rng.choice(["hourly", "fixed"]),
                    budget_or_rate=rng.randint(200, 8000),
                    experience_level=rng.choice(["entry", "intermediate", "expert"]),
                    project_length=rng.choice(
                        ["less-than-1-month", "1-to-3-months", "3-to-6-months", "more-than-6-months"]
                    ),
                    noun=noun,
                )
                absent_skills = [s for s in pool if s not in skills]
                for absent in absent_skills:
                    label = corpus.SKILL_LABELS[absent]
                    assert label.lower() not in description.lower(), (
                        f"description {description!r} mentions unrelated skill label {label!r} "
                        f"for skills={skills}"
                    )


def test_real_batch_of_jobposts_never_mentions_an_unrelated_skill():
    _, _, jobposts, *_ = _setup()
    assert len(jobposts) > 100
    for jobpost in jobposts:
        skills = jobpost["skills"]
        pool = corpus.CATEGORY_SKILLS[jobpost["category"]]
        absent_skills = [s for s in pool if s not in skills]
        haystack = (jobpost["title"] + " " + jobpost["description"]).lower()
        for absent in absent_skills:
            label = corpus.SKILL_LABELS[absent].lower()
            assert (
                label not in haystack
            ), f"jobpost {jobpost['_localId']} (skills={skills}) mentions unrelated skill {label!r}"


# ---------------------------------------------------------------------------
# Review sentiment must agree with the outcome it accompanies.
# ---------------------------------------------------------------------------

_APPROVING_MARKERS = corpus.POSITIVE_GENERIC + corpus.ON_TIME_OR_EARLY_PHRASES + corpus.PAID_WELL_PHRASES
_DISAPPROVING_MARKERS = (
    corpus.NEGATIVE_GENERIC
    + corpus.GHOSTED_PHRASES
    + corpus.VERY_LATE_PHRASES
    + corpus.PAYMENT_ISSUE_PHRASES
    + corpus.CANCELLED_PHRASES
)


def _is_approving(text):
    return any(marker in text for marker in _APPROVING_MARKERS)


def _is_disapproving(text):
    return any(marker in text for marker in _DISAPPROVING_MARKERS)


def test_reviews_on_ghosted_or_badly_late_outcomes_are_never_approving():
    _, _, _, _, engagements, outcomes, reviews = _setup(seed=7, num_profiles=5000)
    outcomes_by_engagement_and_subject = {
        (o["engagementLocalId"], o["subjectProfileLocalId"]): o for o in outcomes
    }

    checked = 0
    for review in reviews:
        outcome = outcomes_by_engagement_and_subject.get(
            (review["engagementLocalId"], review["subjectProfileLocalId"])
        )
        if outcome is None:
            continue
        badly_late = outcome.get("daysLate") is not None and outcome["daysLate"] > 7
        if not (outcome.get("ghosted") or badly_late):
            continue
        checked += 1
        assert not _is_approving(review["text"]), (
            f"review {review['_localId']!r} is approving despite ghosted/badly-late outcome: "
            f"{review['text']!r}"
        )

    assert checked >= 10, "batch did not exercise enough ghosted/badly-late outcomes to be meaningful"


def test_reviews_on_clean_on_time_outcomes_are_not_disapproving():
    _, _, _, _, engagements, outcomes, reviews = _setup(seed=7, num_profiles=5000)
    outcomes_by_engagement_and_subject = {
        (o["engagementLocalId"], o["subjectProfileLocalId"]): o for o in outcomes
    }

    checked = 0
    for review in reviews:
        if review.get("isPlantedSabotage"):
            # A sabotage review is deliberately a low rating attached to good
            # conduct -- that mismatch is the plant, not a defect.
            continue
        outcome = outcomes_by_engagement_and_subject.get(
            (review["engagementLocalId"], review["subjectProfileLocalId"])
        )
        if outcome is None or outcome.get("ghosted") or outcome.get("endedAs") == "cancelled":
            continue
        role = outcome.get("subjectRole")
        clean = False
        if role == "freelancer" and outcome.get("daysLate") is not None and outcome["daysLate"] <= 0:
            clean = True
        if role == "client" and outcome.get("paidInFull") is True and not outcome.get("scopeCreepOccurred"):
            clean = True
        if not clean:
            continue
        checked += 1
        assert not _is_disapproving(
            review["text"]
        ), f"review {review['_localId']!r} is disapproving despite clean outcome: {review['text']!r}"

    assert checked >= 10, "batch did not exercise enough clean outcomes to be meaningful"


# ---------------------------------------------------------------------------
# No empty fields, no excessive duplication across a batch.
# ---------------------------------------------------------------------------


def test_no_text_field_is_empty_across_a_real_batch():
    _, _, jobposts, proposals, _, _, reviews = _setup()
    for jobpost in jobposts:
        assert jobpost["title"].strip()
        assert jobpost["description"].strip()
    for proposal in proposals:
        assert proposal["coverLetter"].strip()
    for review in reviews:
        assert review["text"].strip()


def test_titles_are_not_duplicated_beyond_a_small_fraction():
    _, _, jobposts, *_ = _setup()
    titles = [jp["title"] for jp in jobposts]
    unique_ratio = len(set(titles)) / len(titles)
    assert unique_ratio > 0.5, f"only {unique_ratio:.1%} of {len(titles)} titles are unique"


def test_descriptions_are_not_duplicated_beyond_a_small_fraction():
    _, _, jobposts, *_ = _setup()
    descriptions = [jp["description"] for jp in jobposts]
    unique_ratio = len(set(descriptions)) / len(descriptions)
    assert unique_ratio > 0.5, f"only {unique_ratio:.1%} of {len(descriptions)} descriptions are unique"


def test_review_text_is_not_duplicated_beyond_a_small_fraction():
    _, _, _, _, _, _, reviews = _setup()
    texts = [r["text"] for r in reviews]
    unique_ratio = len(set(texts)) / len(texts)
    assert unique_ratio > 0.3, f"only {unique_ratio:.1%} of {len(texts)} review texts are unique"


def test_a_page_of_twenty_titles_does_not_visibly_repeat():
    """A page of 20 job posts is what a marker actually scrolls -- assert
    the first 20 titles emitted for a single client-heavy run aren't a wall
    of repeats."""
    _, _, jobposts, *_ = _setup(seed=99, num_profiles=200)
    first_twenty = [jp["title"] for jp in jobposts[:20]]
    assert len(set(first_twenty)) >= 15
