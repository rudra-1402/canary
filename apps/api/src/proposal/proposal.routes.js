import { Router } from 'express';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { requireAuth, requireRole } from '../auth/guards.js';
import * as proposalController from './proposal.controller.js';

const router = Router();

router.post(
  '/:proposalId/accept',
  requireAuth,
  csrfSynchronisedProtection,
  requireRole('client'),
  proposalController.accept,
);
router.post(
  '/:proposalId/decline',
  requireAuth,
  csrfSynchronisedProtection,
  requireRole('client'),
  proposalController.decline,
);

router.post(
  '/',
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('freelancer'),
  proposalController.create,
);

export default router;
