import { Router } from 'express';
import { requireAuth } from '../auth/guards.js';
import * as engagementController from './engagement.controller.js';

const router = Router();

router.get('/:engagementId', requireAuth, engagementController.getById);

export default router;
