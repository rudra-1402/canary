import {
  JobPostRiskPreviewParamSchema,
  RequestRiskPreviewSchema,
  RiskPreviewResponseSchema,
} from '@canary/shared';
import { getCurrentUser } from '../auth/getCurrentUser.js';
import { ForbiddenError } from '../lib/errors.js';
import { requestJobPostRiskPreview, toRiskPreviewContract } from './riskPreview.service.js';

export async function requestForJobPost(req, res) {
  const { jobPostId } = JobPostRiskPreviewParamSchema.parse(req.params);
  const input = RequestRiskPreviewSchema.parse(req.body);
  const activeProfile = getCurrentUser(req)?.activeProfile;
  if (!activeProfile) throw new ForbiddenError('Requires an active Profile');
  const result = await requestJobPostRiskPreview(jobPostId, activeProfile, input);
  const data = await toRiskPreviewContract(result);
  res.json(RiskPreviewResponseSchema.parse({ data }));
}
