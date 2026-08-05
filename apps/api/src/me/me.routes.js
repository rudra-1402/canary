import { Router } from 'express';
import { requireAuth } from '../auth/guards.js';
import * as meController from './me.controller.js';

const router = Router();

router.get('/proposals', requireAuth, meController.listProposals);
router.get('/engagements', requireAuth, meController.listEngagements);

export default router;
