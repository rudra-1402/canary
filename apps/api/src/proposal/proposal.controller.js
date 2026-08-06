import {
  AcceptProposalRequestSchema,
  CreateProposalRequestSchema,
  CreateProposalResponseSchema,
  DeclineProposalRequestSchema,
  ProposalDecisionResponseSchema,
  ProposalDeclineResponseSchema,
  ProposalRiskAssessmentParamSchema,
} from '@canary/shared';
import { getCurrentUser } from '../auth/getCurrentUser.js';
import * as proposalService from './proposal.service.js';

export async function create(req, res) {
  const input = CreateProposalRequestSchema.parse(req.body);
  const { activeProfile } = getCurrentUser(req);
  const proposal = await proposalService.createProposal(input, activeProfile.id);
  res
    .status(201)
    .json(
      CreateProposalResponseSchema.parse({ id: proposal._id.toString(), status: proposal.status }),
    );
}

export async function accept(req, res) {
  const { proposalId } = ProposalRiskAssessmentParamSchema.parse(req.params);
  const input = AcceptProposalRequestSchema.parse(req.body);
  const { activeProfile } = getCurrentUser(req);
  const data = await proposalService.acceptProposalCommand(proposalId, activeProfile.id, input);
  res.json(ProposalDecisionResponseSchema.parse({ data }));
}

export async function decline(req, res) {
  const { proposalId } = ProposalRiskAssessmentParamSchema.parse(req.params);
  const input = DeclineProposalRequestSchema.parse(req.body);
  const { activeProfile } = getCurrentUser(req);
  const proposal = await proposalService.declineProposal(proposalId, activeProfile.id, input);
  res.json(
    ProposalDeclineResponseSchema.parse({
      data: { proposal: { id: proposal._id.toString(), status: proposal.status } },
    }),
  );
}
