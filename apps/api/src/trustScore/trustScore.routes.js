import { Router } from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import Profile from '../models/Profile.js';
import { requireAuth } from '../auth/guards.js';
import { ForbiddenError } from '../lib/errors.js';
import * as trustScoreController from './trustScore.controller.js';

const keyGenerator = (req) => String(req.user._id);
const singleStore = new MemoryStore();
const batchStore = new MemoryStore();

export const trustScoreSingleLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  store: singleStore,
});
export const trustScoreBatchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  store: batchStore,
});

export function resetTrustScoreLimiters() {
  singleStore.resetAll();
  batchStore.resetAll();
}

// An authenticated Identity must own at least one Profile before it may evaluate marketplace data.
export async function requireMarketplaceParticipant(req, res, next) {
  if (!(await Profile.exists({ identityId: req.user._id }))) {
    return next(new ForbiddenError('Requires a marketplace Profile'));
  }
  next();
}

const router = Router();
router.get(
  '/',
  requireAuth,
  requireMarketplaceParticipant,
  trustScoreBatchLimiter,
  trustScoreController.list,
);
router.get(
  '/:profileId/outcomes',
  requireAuth,
  requireMarketplaceParticipant,
  trustScoreSingleLimiter,
  trustScoreController.listOutcomes,
);
router.get(
  '/:profileId',
  requireAuth,
  requireMarketplaceParticipant,
  trustScoreSingleLimiter,
  trustScoreController.getByProfileId,
);

export default router;
