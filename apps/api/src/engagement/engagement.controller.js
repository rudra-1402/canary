import { EngagementDetailResponseSchema, EngagementRiskAssessmentParamSchema } from '@canary/shared';
import { getCurrentUser } from '../auth/getCurrentUser.js';
import { ForbiddenError } from '../lib/errors.js';
import * as engagementService from './engagement.service.js';

export async function getById(req, res) {
  const { engagementId } = EngagementRiskAssessmentParamSchema.parse(req.params);
  const activeProfile = getCurrentUser(req)?.activeProfile;
  if (!activeProfile) throw new ForbiddenError('Requires an active Profile');
  const engagement = await engagementService.getEngagementDetail(
    engagementId,
    activeProfile.id,
  );
  res.json(EngagementDetailResponseSchema.parse({ data: { engagement } }));
}
