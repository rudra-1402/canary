import Engagement from '../models/Engagement.js';
import Outcome from '../models/Outcome.js';
import Review from '../models/Review.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';

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
