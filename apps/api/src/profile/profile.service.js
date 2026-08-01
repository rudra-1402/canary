import Profile from '../models/Profile.js';
import Review from '../models/Review.js';
import { NotFoundError } from '../lib/errors.js';
import {
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

export async function getPublicProfileById(id) {
  const doc = await Profile.findById(id).lean();
  if (!doc) throw new NotFoundError('Profile', id);
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
