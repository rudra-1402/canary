import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/guards.js';
import * as meController from './me.controller.js';

const router = Router();

router.get('/proposals', requireAuth, meController.listProposals);
router.get('/engagements', requireAuth, meController.listEngagements);
router.get('/jobposts', requireAuth, requireRole('client'), meController.listJobPosts);

export default router;
