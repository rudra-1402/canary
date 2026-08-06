import {
  EngagementRiskAssessmentParamSchema,
  ProposalRiskAssessmentParamSchema,
  RequestRiskAssessmentSchema,
  RiskAssessmentCommandResponseSchema,
  RiskAssessmentResponseSchema,
} from '@canary/shared';
import { getCurrentUser } from '../auth/getCurrentUser.js';
import { ForbiddenError } from '../lib/errors.js';
import * as riskAssessmentService from './riskAssessment.service.js';

function activeProfileId(req) {
  const activeProfile = getCurrentUser(req)?.activeProfile;
  if (!activeProfile) throw new ForbiddenError('Requires an active Profile');
  return activeProfile.id;
}

export async function requestForProposal(req, res) {
  const { proposalId } = ProposalRiskAssessmentParamSchema.parse(req.params);
  const input = RequestRiskAssessmentSchema.parse(req.body);
  const result = await riskAssessmentService.requestProposalRiskAssessment(
    proposalId,
    activeProfileId(req),
    input,
  );
  const data = await riskAssessmentService.toRiskAssessmentCommandContract(result);
  res.json(RiskAssessmentCommandResponseSchema.parse({ data }));
}

export async function getForEngagement(req, res) {
  const { engagementId } = EngagementRiskAssessmentParamSchema.parse(req.params);
  const riskAssessment = await riskAssessmentService.getEngagementRiskAssessment(
    engagementId,
    activeProfileId(req),
  );
  res.json(RiskAssessmentResponseSchema.parse({ data: { riskAssessment } }));
}
