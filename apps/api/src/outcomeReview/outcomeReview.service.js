import Engagement from '../models/Engagement.js';
import Outcome from '../models/Outcome.js';
import Review from '../models/Review.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { CreateOutcomeReviewResponseSchema, OutcomeSchema } from '@canary/shared';

function sameId(left, right) {
  return String(left) === String(right);
}

function partyRole(engagement, profileId) {
  if (sameId(profileId, engagement.freelancerProfileId)) return 'freelancer';
  if (sameId(profileId, engagement.clientProfileId)) return 'client';
  return null;
}

async function engagementForWrite(engagementId) {
  const engagement = await Engagement.findById(engagementId);
  if (!engagement) throw new NotFoundError('Engagement', engagementId);
  return engagement;
}

// Mongo indexes protect duplicate (engagement, subject/author) pairs, but without transactions
// this has a check-then-write window: concurrent requests can both pass these checks and insert.
// The indexes still prevent the common duplicate-pair case; Outcome cardinality and party-membership
// rules retain a residual race. Closing that gap requires a replica set for transactions and is
// deliberately deferred until Mongo startup is supervised.
export async function createOutcome(input) {
  const engagement = await engagementForWrite(input.engagementId);
  const outcomeCount = await Outcome.countDocuments({ engagementId: engagement._id });
  if (outcomeCount >= 2) {
    throw new BadRequestError('An engagement may have no more than two Outcomes');
  }

  const subjectRole = partyRole(engagement, input.subjectProfileId);
  if (!subjectRole) {
    throw new BadRequestError('Outcome subjectProfileId must be a party to the engagement');
  }
  if (sameId(input.subjectProfileId, input.counterpartyProfileId)) {
    throw new BadRequestError(
      'Outcome subjectProfileId and counterpartyProfileId must be distinct',
    );
  }
  if (
    !sameId(
      input.counterpartyProfileId,
      subjectRole === 'freelancer' ? engagement.clientProfileId : engagement.freelancerProfileId,
    )
  ) {
    throw new BadRequestError(
      'Outcome counterpartyProfileId must be the other party to the engagement',
    );
  }
  if (input.subjectRole !== subjectRole) {
    throw new BadRequestError('Outcome subjectRole must match the subject party on the engagement');
  }

  const existing = await Outcome.exists({
    engagementId: engagement._id,
    subjectProfileId: input.subjectProfileId,
  });
  if (existing) {
    throw new BadRequestError('An Outcome already exists for this engagement and subject');
  }

  try {
    return await Outcome.create(input);
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('An Outcome already exists for this engagement and subject');
    }
    throw error;
  }
}

export async function createReview(input) {
  const engagement = await engagementForWrite(input.engagementId);
  if (sameId(input.authorProfileId, input.subjectProfileId)) {
    throw new BadRequestError(
      'Review authorProfileId and subjectProfileId must be different parties',
    );
  }

  const authorRole = partyRole(engagement, input.authorProfileId);
  if (!authorRole) {
    throw new BadRequestError('Review authorProfileId must be a party to the engagement');
  }
  const oppositeParty =
    authorRole === 'freelancer' ? engagement.clientProfileId : engagement.freelancerProfileId;
  if (!sameId(input.subjectProfileId, oppositeParty)) {
    throw new BadRequestError('Review subjectProfileId must be the opposite party to the author');
  }

  const existing = await Review.exists({
    engagementId: engagement._id,
    authorProfileId: input.authorProfileId,
  });
  if (existing) {
    throw new BadRequestError('An author may write only one Review per engagement');
  }

  try {
    return await Review.create(input);
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('An author may write only one Review per engagement');
    }
    throw error;
  }
}

function hasBothPartyRows(rows, field, engagement) {
  const values = new Set(rows.map((row) => String(row[field])));
  return (
    values.has(String(engagement.freelancerProfileId)) &&
    values.has(String(engagement.clientProfileId))
  );
}

// The ordered inserts intentionally allow an Outcome-only partial write because this deployment
// has no replica set for transactions. A retry by that same party detects its existing Outcome and
// completes the missing Review. There remains a narrow concurrent-request race around completion;
// unique indexes retain the per-party write guard, while a replica set would be needed for atomicity.
export async function createOutcomeReview(input, activeProfileId) {
  const engagement = await engagementForWrite(input.engagementId);
  if (engagement.status !== 'active') {
    throw new BadRequestError('Outcome and Review submission requires an active Engagement');
  }

  const subjectRole = partyRole(engagement, activeProfileId);
  if (!subjectRole) {
    throw new ForbiddenError('Only an Engagement party may submit an Outcome and Review');
  }
  const counterpartyProfileId =
    subjectRole === 'freelancer' ? engagement.clientProfileId : engagement.freelancerProfileId;
  if (sameId(activeProfileId, counterpartyProfileId)) {
    throw new BadRequestError(
      'Review authorProfileId and subjectProfileId must be different parties',
    );
  }

  const outcomeInput = OutcomeSchema.parse({
    engagementId: String(engagement._id),
    subjectProfileId: String(activeProfileId),
    counterpartyProfileId: String(counterpartyProfileId),
    subjectRole,
    ...input.outcome,
    labelSource: 'self-reported',
  });

  const existingReview = await Review.exists({
    engagementId: engagement._id,
    authorProfileId: activeProfileId,
  });
  if (existingReview) {
    throw new BadRequestError('An Outcome and Review submission already exists for this party');
  }

  let outcome = await Outcome.findOne({
    engagementId: engagement._id,
    subjectProfileId: activeProfileId,
  });
  if (!outcome) {
    try {
      outcome = await Outcome.create(outcomeInput);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      outcome = await Outcome.findOne({
        engagementId: engagement._id,
        subjectProfileId: activeProfileId,
      });
      if (!outcome) throw error;
    }
  }

  let review;
  try {
    review = await Review.create({
      engagementId: engagement._id,
      authorProfileId: activeProfileId,
      subjectProfileId: counterpartyProfileId,
      rating: input.review.rating,
      ...(input.review.text === undefined ? {} : { text: input.review.text }),
      visibleAt: null,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('An Outcome and Review submission already exists for this party');
    }
    throw error;
  }

  const [outcomes, reviews] = await Promise.all([
    Outcome.find({
      engagementId: engagement._id,
      subjectProfileId: { $in: [engagement.freelancerProfileId, engagement.clientProfileId] },
    })
      .select('subjectProfileId')
      .lean(),
    Review.find({
      engagementId: engagement._id,
      authorProfileId: { $in: [engagement.freelancerProfileId, engagement.clientProfileId] },
    })
      .select('authorProfileId')
      .lean(),
  ]);
  const complete =
    hasBothPartyRows(outcomes, 'subjectProfileId', engagement) &&
    hasBothPartyRows(reviews, 'authorProfileId', engagement);
  if (complete) {
    const visibleAt = new Date();
    await Review.updateMany(
      {
        engagementId: engagement._id,
        authorProfileId: { $in: [engagement.freelancerProfileId, engagement.clientProfileId] },
        visibleAt: null,
      },
      { $set: { visibleAt } },
    );
    await Engagement.updateOne(
      { _id: engagement._id, status: 'active' },
      { $set: { status: 'concluded' } },
    );
  }

  return CreateOutcomeReviewResponseSchema.parse({
    outcomeId: outcome._id.toString(),
    reviewId: review._id.toString(),
    engagementStatus: complete ? 'concluded' : 'active',
  });
}
