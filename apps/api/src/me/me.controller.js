import { getCurrentUser } from '../auth/getCurrentUser.js';
import { ForbiddenError } from '../lib/errors.js';
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
