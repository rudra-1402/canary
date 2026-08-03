import { CreateOutcomeReviewRequestSchema } from '@canary/shared';
import { getCurrentUser } from '../auth/getCurrentUser.js';
import { ForbiddenError } from '../lib/errors.js';
import * as outcomeReviewService from './outcomeReview.service.js';

export async function create(req, res) {
  const input = CreateOutcomeReviewRequestSchema.parse(req.body);
  const { activeProfile } = getCurrentUser(req);
  if (!activeProfile) throw new ForbiddenError('Requires an active Profile');
  const result = await outcomeReviewService.createOutcomeReview(input, activeProfile.id);
  res.status(201).json(result);
}
