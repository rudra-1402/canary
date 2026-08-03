"""Authored corpus for composing marketplace text deterministically.

Every job post, proposal, and review needs human-readable text a marker will
actually believe. Faker's `job()` / `paragraph()` / `sentence()` produce text
unrelated to the record it sits on -- "Cytogeneticist" as a freelance job
title on a web-development post, "Recent century leg public society." as its
brief, a five-star review reading "Coach summer sit anyone option happy."
next to a ghosted, 30-days-late outcome. All three are visible defects on the
demo's main screen.

Nothing here calls an LLM or reads the wall clock. Every function takes the
seeded `random.Random` its caller already owns (generator/jobposts.py,
generator/proposals.py, generator/reviews.py, generator/ring_engagements.py)
and composes text by drawing from these fragment banks, so
`generate(seed) == generate(seed)` still holds. Composition is driven only by
fields already on the document -- category, skills, jobType, budgetOrRate,
experienceLevel, projectLength for job posts; rating and the outcome's
ghosted/daysLate/paidInFull/scopeCreepOccurred/endedAs for reviews -- so the
text agrees with the data instead of decorating it.
"""

import random

# ---------------------------------------------------------------------------
# Category / skill vocabulary. Each category owns its own skill pool -- a
# job post's skills are always sampled from its own category's pool, so
# "design" can never draw "python" and "node" the way independent draws did
# before. Labels must never be a substring of another skill's label -- a
# document that omits a skill must never accidentally read as mentioning it
# (see test_corpus.py::test_skill_labels_are_pairwise_non_substrings).
# ---------------------------------------------------------------------------

CATEGORY_SKILLS = {
    "web-development": [
        "html-css",
        "javascript",
        "react",
        "vue",
        "node",
        "php",
        "wordpress",
        "api-integration",
        "database-design",
        "laravel",
    ],
    "mobile-development": [
        "swift",
        "kotlin",
        "react-native",
        "flutter",
        "ios-development",
        "android-development",
        "mobile-ui",
        "app-store-optimization",
    ],
    "design": [
        "photoshop",
        "illustrator",
        "figma",
        "ui-design",
        "ux-research",
        "branding",
        "logo-design",
        "typography",
        "print-design",
    ],
    "writing": [
        "copywriting",
        "blog-writing",
        "technical-writing",
        "ghostwriting",
        "editing-proofreading",
        "scriptwriting",
        "grant-writing",
        "resume-writing",
    ],
    "marketing": [
        "seo",
        "social-media-marketing",
        "email-marketing",
        "ppc-advertising",
        "content-strategy",
        "influencer-outreach",
        "marketing-analytics",
        "conversion-optimization",
    ],
    "data-analytics": [
        "python",
        "sql",
        "data-visualization",
        "machine-learning",
        "data-cleaning",
        "excel-modeling",
        "statistics",
        "tableau",
    ],
    "video-animation": [
        "video-editing",
        "after-effects",
        "2d-animation",
        "3d-animation",
        "color-grading",
        "motion-graphics",
        "video-production",
    ],
    "audio-production": [
        "audio-editing",
        "voiceover",
        "music-production",
        "sound-design",
        "podcast-editing",
        "mixing-mastering",
    ],
    "admin-support": [
        "data-entry",
        "virtual-assistant",
        "customer-service",
        "transcription",
        "scheduling",
        "bookkeeping",
        "research",
        "email-management",
    ],
    "business-consulting": [
        "business-planning",
        "financial-modeling",
        "market-research",
        "project-management",
        "process-improvement",
        "crm-setup",
        "grant-strategy",
    ],
}

CATEGORIES = list(CATEGORY_SKILLS)

SKILL_LABELS = {
    "html-css": "HTML/CSS",
    "javascript": "JavaScript",
    "react": "React",
    "vue": "Vue.js",
    "node": "Node.js",
    "php": "PHP",
    "wordpress": "WordPress",
    "api-integration": "API Integration",
    "database-design": "Database Design",
    "laravel": "Laravel",
    "swift": "Swift",
    "kotlin": "Kotlin",
    "react-native": "React Native",
    "flutter": "Flutter",
    "ios-development": "iOS Development",
    "android-development": "Android Development",
    "mobile-ui": "Mobile UI Design",
    "app-store-optimization": "App Store Optimization",
    "photoshop": "Photoshop",
    "illustrator": "Illustrator",
    "figma": "Figma",
    "ui-design": "UI Design",
    "ux-research": "UX Research",
    "branding": "Branding",
    "logo-design": "Logo Design",
    "typography": "Typography",
    "print-design": "Print Design",
    "copywriting": "Copywriting",
    "blog-writing": "Blog Writing",
    "technical-writing": "Technical Writing",
    "ghostwriting": "Ghostwriting",
    "editing-proofreading": "Editing and Proofreading",
    "scriptwriting": "Scriptwriting",
    "grant-writing": "Grant Writing",
    "resume-writing": "Resume Writing",
    "seo": "SEO",
    "social-media-marketing": "Social Media Marketing",
    "email-marketing": "Email Marketing",
    "ppc-advertising": "PPC Advertising",
    "content-strategy": "Content Strategy",
    "influencer-outreach": "Influencer Outreach",
    "marketing-analytics": "Marketing Analytics",
    "conversion-optimization": "Conversion Rate Optimization",
    "python": "Python",
    "sql": "SQL",
    "data-visualization": "Data Visualization",
    "machine-learning": "Machine Learning",
    "data-cleaning": "Data Cleaning",
    "excel-modeling": "Excel Modeling",
    "statistics": "Statistics",
    "tableau": "Tableau",
    "video-editing": "Video Editing",
    "after-effects": "After Effects",
    "2d-animation": "2D Animation",
    "3d-animation": "3D Animation",
    "color-grading": "Color Grading",
    "motion-graphics": "Motion Graphics",
    "video-production": "Video Production",
    "audio-editing": "Audio Editing",
    "voiceover": "Voiceover",
    "music-production": "Music Production",
    "sound-design": "Sound Design",
    "podcast-editing": "Podcast Editing",
    "mixing-mastering": "Mixing and Mastering",
    "data-entry": "Data Entry",
    "virtual-assistant": "Virtual Assistant Support",
    "customer-service": "Customer Service",
    "transcription": "Transcription",
    "scheduling": "Scheduling",
    "bookkeeping": "Bookkeeping",
    "research": "Research",
    "email-management": "Email Management",
    "business-planning": "Business Planning",
    "financial-modeling": "Financial Modeling",
    "market-research": "Market Research",
    "project-management": "Project Management",
    "process-improvement": "Process Improvement",
    "crm-setup": "CRM Setup",
    "grant-strategy": "Grant Strategy",
}

# Generic role-phrase templates keyed only by the skill's own label, so a
# vocabulary this size doesn't need one hand-authored noun phrase per skill.
# Variety comes from combining this template choice with the category noun,
# opener, and logistics-sentence choices below.
SKILL_ROLE_TEMPLATES = [
    "{label} specialist",
    "{label} freelancer",
    "{label} expert",
    "{label} professional",
    "{label} consultant",
    "freelancer skilled in {label}",
]

CATEGORY_NOUNS = {
    "web-development": [
        "a small-business website",
        "a web application",
        "an internal admin tool",
        "a client portal",
        "a marketing site rebuild",
        "a booking system",
    ],
    "mobile-development": [
        "a mobile app for iOS and Android",
        "a companion app for an existing product",
        "a mobile app redesign",
        "a cross-platform app",
        "an MVP mobile app",
    ],
    "design": [
        "a brand identity",
        "a set of marketing graphics",
        "a mobile app redesign",
        "a pitch deck",
        "packaging artwork",
        "a style guide",
    ],
    "writing": [
        "a blog content series",
        "a batch of product descriptions",
        "a help-center rewrite",
        "an e-book",
        "newsletter copy",
        "a set of case studies",
    ],
    "marketing": [
        "a paid social campaign",
        "a customer lifecycle messaging series",
        "a product launch plan",
        "a lead-generation funnel",
        "a quarterly promotional push",
        "a referral program",
    ],
    "data-analytics": [
        "a sales dashboard",
        "a customer data cleanup",
        "a demand forecasting model",
        "an analytics pipeline",
        "a reporting workflow",
    ],
    "video-animation": [
        "a product demo video",
        "a short explainer animation",
        "a series of social video clips",
        "an intro and outro package",
        "a highlight reel",
    ],
    "audio-production": [
        "a podcast series",
        "a set of narration recordings",
        "a jingle for an ad campaign",
        "an audiobook chapter",
        "an audio pass for a video project",
    ],
    "admin-support": [
        "a backlog of records to enter",
        "ongoing inbox and calendar management",
        "a customer support queue",
        "a set of interview transcripts",
        "recurring financial recordkeeping",
    ],
    "business-consulting": [
        "a business plan for a new venture",
        "a financial model for a fundraising round",
        "a competitive landscape report",
        "a process audit",
        "a customer database migration",
    ],
}

CATEGORY_OPENERS = {
    "web-development": [
        "We're building {noun} and need outside help to get it done.",
        "Our team is behind on {noun} and needs a freelancer to pick it up.",
        "We have a rough spec for {noun} but no one in-house to build it.",
        "This is {noun}, starting mostly from scratch.",
    ],
    "mobile-development": [
        "We need {noun} built from an existing design.",
        "Our in-house team is stretched thin and {noun} needs an owner.",
        "This is {noun}, and we already have wireframes ready to share.",
        "We're planning to ship {noun} within the next quarter.",
    ],
    "design": [
        "We need {noun} produced from a short brief.",
        "Our in-house team doesn't have bandwidth for {noun} right now.",
        "We're looking to get {noun} done before a launch date.",
        "This is {noun}, and we already have rough reference material to share.",
    ],
    "writing": [
        "We need {noun} written from bullet-point notes we can provide.",
        "Our content calendar is behind and {noun} needs to get done.",
        "We're looking for someone to take over {noun} on an ongoing basis.",
        "This is {noun}, and we can supply a style guide to work from.",
    ],
    "marketing": [
        "We need {noun} planned and executed end to end.",
        "Our last attempt at {noun} underperformed and we want a fresh take.",
        "We're launching soon and {noun} needs an owner.",
        "This is {noun}, and we have a budget already approved.",
    ],
    "data-analytics": [
        "We need {noun} built from data we already have on hand.",
        "Our team doesn't have the bandwidth to put together {noun} right now.",
        "This is {noun}, and we can share sample data to start from.",
        "We need {noun} finished before our next planning cycle.",
    ],
    "video-animation": [
        "We need {noun} produced from raw footage we already have.",
        "Our marketing team needs {noun} for an upcoming push.",
        "This is {noun}, and we can share a rough script or storyboard.",
        "We're looking for someone to turn around {noun} on a tight timeline.",
    ],
    "audio-production": [
        "We need {noun} produced from raw recordings we already have.",
        "This is {noun}, and we can share reference tracks to match the tone.",
        "Our team needs {noun} finished before an upcoming release.",
        "We're looking for someone to take {noun} from rough cut to final.",
    ],
    "admin-support": [
        "We need {noun} handled on a recurring basis.",
        "Our team is underwater and {noun} needs an owner.",
        "This is {noun}, mostly routine but steady work.",
        "We're looking for someone reliable to take over {noun}.",
    ],
    "business-consulting": [
        "We need {noun} put together before we talk to investors.",
        "Our team doesn't have the expertise in-house for {noun}.",
        "This is {noun}, and we can share our existing numbers to start from.",
        "We need an outside perspective on {noun}.",
    ],
}

JOB_TYPE_RATE_SUFFIX = {"hourly": "an hour", "fixed": "for the whole project"}

EXPERIENCE_PHRASES = {
    "entry": [
        "Open to someone early in their freelance career.",
        "Junior freelancers are welcome to apply.",
    ],
    "intermediate": [
        "Looking for solid mid-level experience, not necessarily a specialist.",
        "A few years of relevant experience is preferred.",
    ],
    "expert": [
        "Only considering senior, proven freelancers for this one.",
        "This needs someone with deep, demonstrated expertise.",
    ],
}

PROJECT_LENGTH_PHRASES = {
    "less-than-1-month": [
        "Should wrap up in under a month.",
        "Quick turnaround expected, under four weeks.",
    ],
    "1-to-3-months": [
        "Expect this to run one to three months.",
        "Timeline is roughly one to three months.",
    ],
    "3-to-6-months": [
        "This is a three-to-six month engagement.",
        "Plan for three to six months of work.",
    ],
    "more-than-6-months": [
        "This is a longer engagement, six months or more.",
        "Expect an ongoing relationship beyond six months.",
    ],
}

CLOSING_SENTENCES = [
    "Please share relevant work samples with your proposal.",
    "Include a short note on your approach when you apply.",
    "Happy to answer questions before you submit a bid.",
    "A quick portfolio link is enough to get started.",
]

TITLE_TEMPLATES = [
    "{skill_phrase} needed for {noun}",
    "Looking for a {skill_phrase} to help with {noun}",
    "{skill_phrase} wanted: {noun}",
    "Freelance {skill_phrase} for {noun}",
    "Hiring a {skill_phrase} for {noun}",
]

TITLE_TEMPLATES_TWO_SKILL = [
    "{skill_phrase} ({second_label} a plus) for {noun}",
    "{skill_phrase} with {second_label} experience for {noun}",
    "{skill_phrase} and {second_label} help needed for {noun}",
]


def _skill_phrase(rng: random.Random, skill: str) -> str:
    return rng.choice(SKILL_ROLE_TEMPLATES).format(label=SKILL_LABELS[skill])


def _join_labels(labels: list[str]) -> str:
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    return ", ".join(labels[:-1]) + f", and {labels[-1]}"


def compose_job_title(rng: random.Random, category: str, skills: list[str]) -> str:
    """A plausible freelance engagement title consistent with category and skills.

    Only ever pulls wording from `skills`' own entries in SKILL_ROLE_PHRASES /
    SKILL_LABELS, so a title can never mention a skill absent from the
    document.
    """
    noun = rng.choice(CATEGORY_NOUNS[category])
    ordered_skills = list(skills)
    rng.shuffle(ordered_skills)
    primary = ordered_skills[0]
    skill_phrase = _skill_phrase(rng, primary)

    if len(ordered_skills) > 1 and rng.random() < 0.5:
        second_label = SKILL_LABELS[ordered_skills[1]]
        template = rng.choice(TITLE_TEMPLATES_TWO_SKILL)
        title = template.format(skill_phrase=skill_phrase, second_label=second_label, noun=noun)
    else:
        template = rng.choice(TITLE_TEMPLATES)
        title = template.format(skill_phrase=skill_phrase, noun=noun)

    return title[0].upper() + title[1:]


def compose_job_description(
    rng: random.Random,
    *,
    category: str,
    skills: list[str],
    job_type: str,
    budget_or_rate,
    experience_level: str,
    project_length: str,
) -> str:
    """A short, believable client brief consistent with the document's fields.

    Skill requirements only ever name the skills already on the document, so
    a post tagged seo + copywriting never reads like an embedded-firmware
    job.
    """
    noun = rng.choice(CATEGORY_NOUNS[category])
    sentences = [rng.choice(CATEGORY_OPENERS[category]).format(noun=noun)]

    ordered_skills = list(skills)
    rng.shuffle(ordered_skills)
    skill_labels = [SKILL_LABELS[s] for s in ordered_skills]
    sentences.append(f"You should be comfortable with {_join_labels(skill_labels)}.")

    rate_suffix = JOB_TYPE_RATE_SUFFIX[job_type]
    sentences.append(f"Budget is around ${budget_or_rate} {rate_suffix}.")

    sentences.append(rng.choice(EXPERIENCE_PHRASES[experience_level]))

    if rng.random() < 0.7:
        sentences.append(rng.choice(PROJECT_LENGTH_PHRASES[project_length]))

    if rng.random() < 0.4:
        sentences.append(rng.choice(CLOSING_SENTENCES))

    return " ".join(sentences)


# ---------------------------------------------------------------------------
# Proposal cover letters.
# ---------------------------------------------------------------------------

COVER_OPENERS = [
    "I'd like to take this on.",
    "This looks like a good fit for my background.",
    "I've done similar work before and can start soon.",
    "Happy to walk through my approach before you commit to anything.",
    "This is squarely in my wheelhouse.",
]

COVER_CLOSERS = [
    "Let me know if you'd like to see relevant samples first.",
    "Available to start as soon as we agree on scope.",
    "Can hop on a short call if that's useful.",
    "Open to adjusting the timeline if needed.",
]


def compose_cover_letter(
    rng: random.Random,
    *,
    category: str,
    skills: list[str],
    bid,
    proposed_duration_days: int,
) -> str:
    """A short cover letter consistent with the freelancer's bid and proposed duration."""
    ordered_skills = list(skills)
    rng.shuffle(ordered_skills)
    primary_skill = ordered_skills[0]
    skill_phrase = _skill_phrase(rng, primary_skill)

    sentences = [rng.choice(COVER_OPENERS)]
    sentences.append(f"I work regularly as a {skill_phrase} on {category.replace('-', ' ')} projects.")
    sentences.append(f"My bid comes to ${bid} and I can deliver in about {proposed_duration_days} days.")
    if rng.random() < 0.6:
        sentences.append(rng.choice(COVER_CLOSERS))

    return " ".join(sentences)


# ---------------------------------------------------------------------------
# Review text. Sentiment is driven by the outcome the review accompanies,
# not the numeric rating alone -- a 5-star review next to a ghosted,
# 30-days-late outcome is a data defect a marker can spot by reading two
# adjacent fields.
# ---------------------------------------------------------------------------

GHOSTED_PHRASES = [
    "Never delivered and stopped responding entirely.",
    "Went silent partway through and never finished the work.",
    "Disappeared without a word, work was left unfinished.",
    "Ghosted us after the first check-in, no explanation given.",
    "Stopped answering messages halfway through the project.",
    "Went dark with no delivery and no way to reach them.",
]

CANCELLED_PHRASES = [
    "We ended up cancelling before the work was finished.",
    "This engagement was called off partway through.",
    "Didn't end up completing the project, we cancelled it.",
    "We pulled the plug on this one before it wrapped up.",
]

VERY_LATE_PHRASES = [
    "Delivered more than a week past the deadline.",
    "Finished the work, but very late, well past the due date.",
    "Missed the deadline by a wide margin.",
    "Delivery slipped by weeks with little warning.",
    "Took far longer than agreed to finish.",
]

LATE_PHRASES = [
    "Ran a few days past the agreed deadline.",
    "Delivered a little late but got there in the end.",
    "A bit behind schedule, though the work itself was fine.",
    "Slipped the deadline slightly, nothing major.",
]

ON_TIME_OR_EARLY_PHRASES = [
    "Delivered right on schedule.",
    "Finished ahead of the deadline, which was a nice surprise.",
    "Hit every deadline without needing a reminder.",
    "Delivered early and communicated well throughout.",
    "Right on time, no chasing needed.",
    "Turned everything around faster than expected.",
]

PAYMENT_ISSUE_PHRASES = [
    "Payment was incomplete after the work was delivered.",
    "Had to chase this client down to get paid in full.",
    "Did not pay the full agreed amount.",
    "Ended up short on the agreed payment.",
]

SCOPE_CREEP_PHRASES = [
    "Kept adding requests well beyond what we'd agreed on.",
    "Scope grew past the original brief without extra pay.",
    "Asked for a lot more revisions than we'd scoped for.",
    "Requirements kept shifting after we'd already agreed on scope.",
]

PAID_WELL_PHRASES = [
    "Paid in full, right on time.",
    "No issues with payment at all.",
    "Paid promptly and stuck to the agreed scope.",
    "Payment came through exactly as agreed.",
    "Straightforward payment, no back and forth needed.",
]

POSITIVE_GENERIC = [
    "Would work with them again.",
    "Great communication throughout the project.",
    "Exactly what we needed, no complaints.",
    "Professional from start to finish.",
    "Easy to work with and reliable.",
    "Would recommend without hesitation.",
    "Clear communication and no surprises.",
    "Handled everything smoothly from start to finish.",
]

NEUTRAL_GENERIC = [
    "It was an okay experience overall.",
    "Got the job done, nothing exceptional either way.",
    "A fine experience, would consider again for smaller work.",
    "Reasonable overall, a few rough patches along the way.",
    "Middle-of-the-road experience, nothing to complain about.",
]

NEGATIVE_GENERIC = [
    "Would not recommend.",
    "Would not hire again.",
    "Not a good experience overall.",
    "Communication was a real problem throughout.",
    "Would think twice before working with them again.",
    "Overall a frustrating experience.",
]

_TONE_POOLS = {
    "positive": POSITIVE_GENERIC,
    "neutral": NEUTRAL_GENERIC,
    "negative": NEGATIVE_GENERIC,
}

_OPENING_PREFIXES = ["", "", "Overall, ", "Honestly, ", "In short, ", "To sum up, "]


def _rating_tone(rating: int) -> str:
    if rating >= 4:
        return "positive"
    if rating == 3:
        return "neutral"
    return "negative"


def _with_prefix(rng: random.Random, sentence: str) -> str:
    prefix = rng.choice(_OPENING_PREFIXES)
    if not prefix:
        return sentence
    return prefix + sentence[0].lower() + sentence[1:]


def compose_review_text(rng: random.Random, rating: int, outcome: dict | None) -> str:
    """Review text whose sentiment agrees with the outcome it accompanies.

    Outcome fields take priority over the numeric rating: a ghosted or
    badly-late outcome always reads as disapproving, and a clean,
    on-time/paid-in-full outcome always reads as approving, regardless of
    which rating band produced it. When the outcome carries no strong signal
    (not observed, or a role/field combination with nothing to say), falls
    back to the rating's own tone.
    """
    outcome = outcome or {}
    role = outcome.get("subjectRole")
    primary = None
    tone = None

    if outcome.get("ghosted"):
        primary = rng.choice(GHOSTED_PHRASES)
        tone = "negative"
    elif outcome.get("endedAs") == "cancelled":
        primary = rng.choice(CANCELLED_PHRASES)
        tone = "negative"
    elif role == "freelancer" and outcome.get("daysLate") is not None:
        days_late = outcome["daysLate"]
        if days_late > 7:
            primary, tone = rng.choice(VERY_LATE_PHRASES), "negative"
        elif days_late > 0:
            primary, tone = rng.choice(LATE_PHRASES), "neutral"
        else:
            primary, tone = rng.choice(ON_TIME_OR_EARLY_PHRASES), "positive"
    elif role == "client" and outcome.get("paidInFull") is not None:
        if outcome.get("paidInFull") is False:
            primary, tone = rng.choice(PAYMENT_ISSUE_PHRASES), "negative"
        elif outcome.get("scopeCreepOccurred"):
            primary, tone = rng.choice(SCOPE_CREEP_PHRASES), "neutral"
        else:
            primary, tone = rng.choice(PAID_WELL_PHRASES), "positive"

    if primary is None:
        tone = _rating_tone(rating)
        primary = rng.choice(_TONE_POOLS[tone])

    sentences = [_with_prefix(rng, primary)]
    pool = _TONE_POOLS[tone]
    if rng.random() < 0.6:
        second = rng.choice(pool)
        if second != primary:
            sentences.append(second)
    if len(sentences) > 1 and rng.random() < 0.25:
        third = rng.choice(pool)
        if third not in (primary, sentences[1]):
            sentences.append(third)

    return " ".join(sentences)
