import { getCurrentUser } from '../auth/getCurrentUser.js';
import { ForbiddenError } from '../lib/errors.js';
import { MyJobPostListQuerySchema } from '@canary/shared';
import * as meService from './me.service.js';

function activeProfileId(req) {
  const activeProfile = getCurrentUser(req).activeProfile;
  if (!activeProfile) throw new ForbiddenError('Requires an active Profile');
  return activeProfile.id;
}

export async function listProposals(req, res) {
  const proposals = await meService.listMyProposals(activeProfileId(req));
  res.json(proposals);
}

export async function listEngagements(req, res) {
  const engagements = await meService.listMyEngagements(activeProfileId(req));
  res.json(engagements);
}

export async function listJobPosts(req, res) {
  const query = MyJobPostListQuerySchema.parse(req.query);
  const jobPosts = await meService.listMyJobPosts(activeProfileId(req), query);
  res.json(jobPosts);
}
