import { CreateProposalRequestSchema, CreateProposalResponseSchema } from '@canary/shared';
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
