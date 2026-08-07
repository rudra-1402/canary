import { Router } from 'express';
import { requireAuth } from '../auth/guards.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import * as riskPreviewController from './riskPreview.controller.js';

export const jobPostRiskPreviewRouter = Router();
jobPostRiskPreviewRouter.post(
  '/:jobPostId/risk-preview',
  requireAuth,
  csrfSynchronisedProtection,
  riskPreviewController.requestForJobPost,
);
