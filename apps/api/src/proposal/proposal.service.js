import Proposal from '../models/Proposal.js';
import JobPost from '../models/JobPost.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';

export async function createProposal(input, freelancerProfileId) {
  const jobPost = await JobPost.findById(input.jobPostId);
  if (!jobPost) throw new NotFoundError('JobPost', input.jobPostId);
  if (jobPost.status !== 'open') throw new BadRequestError('Proposals require an open JobPost');
  if (String(jobPost.clientProfileId) === String(freelancerProfileId)) {
    throw new ForbiddenError('Cannot submit a Proposal to your own JobPost');
  }

  try {
    return await Proposal.create({ ...input, freelancerProfileId, status: 'submitted' });
  } catch (error) {
    if (error?.code === 11000) {
      throw new BadRequestError('A Proposal already exists for this JobPost and freelancer');
    }
    throw error;
  }
}
