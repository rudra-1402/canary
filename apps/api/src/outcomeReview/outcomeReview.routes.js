import { Router } from 'express';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { requireAuth } from '../auth/guards.js';
import * as outcomeReviewController from './outcomeReview.controller.js';

const router = Router();

router.post('/', csrfSynchronisedProtection, requireAuth, outcomeReviewController.create);

export default router;
