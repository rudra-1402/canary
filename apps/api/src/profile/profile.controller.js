import {
  ClientProfilePatchSchema,
  FreelancerGalleryQuerySchema,
  FreelancerProfilePatchSchema,
  ProfileIdParamSchema,
  ProfileReviewListQuerySchema,
} from '@canary/shared';
import { getCurrentUser } from '../auth/getCurrentUser.js';
import { ForbiddenError } from '../lib/errors.js';
import * as profileService from './profile.service.js';

export async function listFreelancers(req, res) {
  const query = FreelancerGalleryQuerySchema.parse(req.query);
  const user = getCurrentUser(req);
  res.json(await profileService.listDiscoverableFreelancers(query, user.identityId));
}

export async function getById(req, res) {
  const { id } = ProfileIdParamSchema.parse(req.params);
  const profile = await profileService.getPublicProfileById(id, getCurrentUser(req)?.identityId);
  res.json(profile);
}

export async function update(req, res) {
  const { id } = ProfileIdParamSchema.parse(req.params);
  const user = getCurrentUser(req);
  if (!user.activeProfile) throw new ForbiddenError('Requires an active Profile');
  const schema =
    user.activeProfile.role === 'freelancer'
      ? FreelancerProfilePatchSchema
      : ClientProfilePatchSchema;
  const patch = schema.parse(req.body);
  res.json(
    await profileService.updateOwnedProfile({
      profileId: id,
      identityId: user.identityId,
      activeProfile: user.activeProfile,
      patch,
    }),
  );
}

export async function listReviews(req, res) {
  const { id } = ProfileIdParamSchema.parse(req.params);
  const query = ProfileReviewListQuerySchema.parse(req.query);
  const reviews = await profileService.listVisibleProfileReviews(id, query);
  res.json(reviews);
}
