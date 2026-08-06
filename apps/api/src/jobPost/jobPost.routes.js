import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/guards.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import * as jobPostController from './jobPost.controller.js';

const router = Router();

router.get('/', jobPostController.list);
router.post(
  '/',
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('client'),
  jobPostController.create,
);
router.patch(
  '/:id',
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('client'),
  jobPostController.update,
);
router.get('/:id/proposals', requireAuth, requireRole('client'), jobPostController.listProposals);
router.get('/:id', jobPostController.getById);

export default router;
