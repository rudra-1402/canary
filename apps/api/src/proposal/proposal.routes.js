import { Router } from 'express';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import { requireAuth, requireRole } from '../auth/guards.js';
import * as proposalController from './proposal.controller.js';

const router = Router();

router.post(
  '/',
  csrfSynchronisedProtection,
  requireAuth,
  requireRole('freelancer'),
  proposalController.create,
);

export default router;
