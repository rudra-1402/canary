import { TrustScoreIdParamSchema, TrustScoreBatchQuerySchema } from '@canary/shared';
import * as trustScoreService from './trustScore.service.js';

export async function getByProfileId(req, res) {
  const { profileId } = TrustScoreIdParamSchema.parse(req.params);
  const result = await trustScoreService.getTrustScore(profileId, req.user._id);
  res.set('Cache-Control', 'private, no-store').json(result);
}

export async function list(req, res) {
  const { profileIds } = TrustScoreBatchQuerySchema.parse(req.query);
  const result = await trustScoreService.getTrustScoreBatch(profileIds, req.user._id);
  res.set('Cache-Control', 'private, no-store').json(result);
}
