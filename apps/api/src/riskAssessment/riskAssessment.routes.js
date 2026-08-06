import { Router } from 'express';
import { requireAuth } from '../auth/guards.js';
import { csrfSynchronisedProtection } from '../config/csrf.js';
import * as riskAssessmentController from './riskAssessment.controller.js';

export const proposalRiskAssessmentRouter = Router();
proposalRiskAssessmentRouter.post(
  '/:proposalId/risk-assessment',
  requireAuth,
  csrfSynchronisedProtection,
  riskAssessmentController.requestForProposal,
);

export const engagementRiskAssessmentRouter = Router();
engagementRiskAssessmentRouter.get(
  '/:engagementId/risk-assessment',
  requireAuth,
  riskAssessmentController.getForEngagement,
);
