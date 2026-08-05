import { ProfileIdParamSchema, ProfileReviewListQuerySchema } from '@canary/shared';
import * as profileService from './profile.service.js';

export async function getById(req, res) {
  const { id } = ProfileIdParamSchema.parse(req.params);
  const profile = await profileService.getPublicProfileById(id);
  res.json(profile);
}

export async function listReviews(req, res) {
  const { id } = ProfileIdParamSchema.parse(req.params);
  const query = ProfileReviewListQuerySchema.parse(req.query);
  const reviews = await profileService.listVisibleProfileReviews(id, query);
  res.json(reviews);
}
