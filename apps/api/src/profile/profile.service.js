import Profile from '../models/Profile.js';
import Review from '../models/Review.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  ProfileUpdateResponseSchema,
  ProfileReviewListResponseSchema,
  PublicProfileSchema,
  PublicReviewSchema,
} from '@canary/shared';

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
