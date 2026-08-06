import { Router } from 'express';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { requireAuth } from '../auth/guards.js';
import * as profileController from './profile.controller.js';

const router = Router();

router.patch('/:id', csrfSynchronisedProtection, requireAuth, profileController.update);
router.get('/:id/reviews', profileController.listReviews);
router.get('/:id', profileController.getById);

export default router;
