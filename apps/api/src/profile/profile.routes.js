import { Router } from 'express';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { requireAuth, requireRole } from '../auth/guards.js';
import * as profileController from './profile.controller.js';

const router = Router();

router.get('/', requireAuth, requireRole('client'), profileController.listFreelancers);
router.patch('/:id', csrfSynchronisedProtection, requireAuth, profileController.update);
router.get('/:id/reviews', profileController.listReviews);
router.get('/:id', profileController.getById);

export default router;
