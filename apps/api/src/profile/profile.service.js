import Profile from '../models/Profile.js';
import Review from '../models/Review.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  FreelancerGalleryResponseSchema,
  ProfileUpdateResponseSchema,
  ProfileReviewListResponseSchema,
  PublicProfileSchema,
  PublicReviewSchema,
} from '@canary/shared';
import { getTrustScores } from '../trustScore/trustScore.service.js';

// Explicit response mapping prevents Profile ownership and Identity/auth data from leaking.
export function toPublicProfileContract(doc) {
  return {
    id: doc._id.toString(),
    role: doc.role,
    displayName: doc.displayName,
    headline: doc.headline,
    bio: doc.bio,
    businessName: doc.businessName,
    paymentVerified: Boolean(doc.paymentVerified),
    verificationStatus: doc.verificationStatus,
    skills: doc.skills ?? [],
    hourlyRate: doc.hourlyRate,
    portfolio: doc.portfolio ?? [],
    workHistory: doc.workHistory ?? [],
    certifications: doc.certifications ?? [],
    languages: doc.languages ?? [],
    availableForWork: doc.availableForWork,
    country: doc.country,
    industry: doc.industry,
    typicalBudget: doc.typicalBudget,
    paymentTermsNorm: doc.paymentTermsNorm,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export function toOwnerProfileContract(doc) {
  return {
    ...toPublicProfileContract(doc),
    discoverable: Boolean(doc.discoverable),
    onboardingCompletedAt: doc.onboardingCompletedAt
      ? new Date(doc.onboardingCompletedAt).toISOString()
      : null,
  };
}

function hasValue(profile, field) {
  const value = profile[field];
  if (field === 'availableForWork') return typeof value === 'boolean';
  if (field === 'hourlyRate' || field === 'typicalBudget') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

const REQUIRED_ONBOARDING_FIELDS = {
  freelancer: [
    'displayName',
    'headline',
    'bio',
    'country',
    'skills',
    'hourlyRate',
    'languages',
    'availableForWork',
  ],
  client: [
    'displayName',
    'businessName',
    'headline',
    'bio',
    'country',
    'industry',
    'typicalBudget',
    'paymentTermsNorm',
  ],
};

export function getOnboardingState(profile) {
  const required = REQUIRED_ONBOARDING_FIELDS[profile.role] ?? [];
  const missingFields = required.filter((field) => !hasValue(profile, field));
  return { complete: missingFields.length === 0, missingFields };
}

export async function updateOwnedProfile({ profileId, identityId, activeProfile, patch }) {
  if (!activeProfile || String(activeProfile.id) !== String(profileId)) {
    throw new ForbiddenError('Not your active Profile');
  }
  const profile = await Profile.findOne({
    _id: profileId,
    identityId,
    role: activeProfile.role,
  });
  if (!profile) throw new ForbiddenError('Not your active Profile');

  Object.assign(profile, patch);
  const onboarding = getOnboardingState(profile);
  if (onboarding.complete && !profile.onboardingCompletedAt) {
    profile.onboardingCompletedAt = new Date();
  }
  await profile.save();
  return ProfileUpdateResponseSchema.parse({
    profile: toOwnerProfileContract(profile),
    onboarding,
  });
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function galleryMatch(query) {
  const match = {
    role: 'freelancer',
    discoverable: true,
    availableForWork: true,
  };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    match.$or = [{ displayName: pattern }, { headline: pattern }, { skills: pattern }];
  }
  if (query.skills?.length) {
    match.skills = {
      $all: query.skills.map((skill) => new RegExp(`^${escapeRegex(skill)}$`, 'i')),
    };
  }
  if (query.country) {
    match.country = new RegExp(`^${escapeRegex(query.country)}$`, 'i');
  }
  if (query.minRate !== undefined || query.maxRate !== undefined) {
    match.hourlyRate = {};
    if (query.minRate !== undefined) match.hourlyRate.$gte = query.minRate;
    if (query.maxRate !== undefined) match.hourlyRate.$lte = query.maxRate;
  }
  return match;
}

function trustBandMatch(trustBand) {
  if (!trustBand) return null;
  const score =
    trustBand === 'BAND_LOW'
      ? { $lt: 25 }
      : trustBand === 'BAND_MED'
        ? { $gte: 25, $lt: 75 }
        : { $gte: 75 };
  return { 'latestTrust.status': 'scored', 'latestTrust.score': score };
}

function gallerySort(sort) {
  if (sort === 'trust-desc') return { 'latestTrust.score': -1, displayName: 1, _id: 1 };
  if (sort === 'rate-asc') return { hourlyRate: 1, displayName: 1, _id: 1 };
  if (sort === 'rate-desc') return { hourlyRate: -1, displayName: 1, _id: 1 };
  return { displayName: 1, _id: 1 };
}

export async function listDiscoverableFreelancers(query, identityId) {
  const pipeline = [
    { $match: galleryMatch(query) },
    {
      $lookup: {
        from: 'trustscores',
        let: { profileId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$profileId', '$$profileId'] } } },
          { $sort: { generatedAt: -1, _id: -1 } },
          { $limit: 1 },
        ],
        as: 'latestTrustRows',
      },
    },
    { $set: { latestTrust: { $arrayElemAt: ['$latestTrustRows', 0] } } },
  ];
  const bandMatch = trustBandMatch(query.trustBand);
  if (bandMatch) pipeline.push({ $match: bandMatch });
  pipeline.push(
    {
      $lookup: {
        from: 'engagements',
        let: { profileId: '$_id' },
        pipeline: [
          {
            $match: {
              status: 'active',
              $expr: { $eq: ['$freelancerProfileId', '$$profileId'] },
            },
          },
          { $project: { _id: 1 } },
        ],
        as: 'activeEngagements',
      },
    },
    { $set: { activeEngagementCount: { $size: '$activeEngagements' } } },
    { $sort: gallerySort(query.sort) },
    {
      $facet: {
        data: [
          { $skip: (query.page - 1) * query.pageSize },
          { $limit: query.pageSize },
        ],
        total: [{ $count: 'value' }],
      },
    },
  );

  const [result] = await Profile.aggregate(pipeline);
  const docs = result?.data ?? [];
  const total = result?.total?.[0]?.value ?? 0;
  if (docs.length === 0) {
    return FreelancerGalleryResponseSchema.parse({
      data: [],
      pagination: { page: query.page, pageSize: query.pageSize, total },
    });
  }

  const trustRows = await getTrustScores(
    docs.map((doc) => String(doc._id)),
    identityId,
  );
  const trustByProfile = new Map(trustRows.map((trust) => [trust.profileId, trust]));
  return FreelancerGalleryResponseSchema.parse({
    data: docs.map((doc) => ({
      ...toPublicProfileContract(doc),
      activeEngagementCount: doc.activeEngagementCount,
      trust: trustByProfile.get(String(doc._id)),
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total },
  });
}

export function toPublicReviewContract(doc) {
  return {
    id: doc._id.toString(),
    engagementId: doc.engagementId.toString(),
    authorProfileId: doc.authorProfileId.toString(),
    subjectProfileId: doc.subjectProfileId.toString(),
    rating: doc.rating,
    text: doc.text,
    visibleAt: new Date(doc.visibleAt).toISOString(),
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}

export async function getPublicProfileById(id, identityId) {
  const doc = await Profile.findById(id).lean();
  if (!doc) throw new NotFoundError('Profile', id);
  const isOwner = identityId && String(doc.identityId) === String(identityId);
  if (!doc.discoverable && !isOwner) throw new NotFoundError('Profile', id);
  return PublicProfileSchema.parse(toPublicProfileContract(doc));
}

export async function listVisibleProfileReviews(profileId, query) {
  const profile = await Profile.exists({ _id: profileId });
  if (!profile) throw new NotFoundError('Profile', profileId);

  const filter = {
    subjectProfileId: profileId,
    visibleAt: { $exists: true, $ne: null, $lte: new Date() },
  };
  const { page, pageSize } = query;
  const [docs, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Review.countDocuments(filter),
  ]);
  return ProfileReviewListResponseSchema.parse({
    data: docs.map((doc) => PublicReviewSchema.parse(toPublicReviewContract(doc))),
    pagination: { page, pageSize, total },
  });
}
