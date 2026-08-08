import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import passport from 'passport';
import { getHealthStatus } from './health.js';
import jobPostRouter from './jobPost/jobPost.routes.js';
import trustScoreRouter from './trustScore/trustScore.routes.js';
import authRouter from './auth/auth.routes.js';
import profileRouter from './profile/profile.routes.js';
import meRouter from './me/me.routes.js';
import proposalRouter from './proposal/proposal.routes.js';
import outcomeReviewRouter from './outcomeReview/outcomeReview.routes.js';
import engagementRouter from './engagement/engagement.routes.js';
import {
  engagementRiskAssessmentRouter,
  proposalRiskAssessmentRouter,
} from './riskAssessment/riskAssessment.routes.js';
import { jobPostRiskPreviewRouter } from './riskAssessment/riskPreview.routes.js';
import { buildSessionMiddleware } from './config/session.js';
import { configurePassport } from './config/passport.js';
import { errorMiddleware } from './lib/errorMiddleware.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  // Credentialed CORS: require an explicit CLIENT_URL in prod, permissive only in dev.
  const corsOrigin =
    process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? false : true);
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json());

  app.use(buildSessionMiddleware(mongoose.connection));
  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/api/health', (req, res) => res.json(getHealthStatus()));
  app.use('/api/jobposts', jobPostRouter);
  app.use('/api/jobposts', jobPostRiskPreviewRouter);
  app.use('/api/proposals', proposalRouter);
  app.use('/api/proposals', proposalRiskAssessmentRouter);
  app.use('/api/engagements', engagementRiskAssessmentRouter);
  app.use('/api/engagements', engagementRouter);
  app.use('/api/outcome-reviews', outcomeReviewRouter);
  app.use('/api/trust-scores', trustScoreRouter);
  app.use('/api/profiles', profileRouter);
  app.use('/api/me', meRouter);
  app.use('/api/auth', authRouter);

  app.use(errorMiddleware);
  return app;
}
