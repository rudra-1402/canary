import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import passport from 'passport';
import { getHealthStatus } from './health.js';
import jobPostRouter from './jobPost/jobPost.routes.js';
import authRouter from './auth/auth.routes.js';
import { buildSessionMiddleware } from './config/session.js';
import { configurePassport } from './config/passport.js';
import { errorMiddleware } from './lib/errorMiddleware.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  // Credentialed CORS must not reflect an arbitrary origin. In production require an
  // explicit CLIENT_URL allowlist; only fall back to permissive in local dev.
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
  app.use('/api/auth', authRouter);

  app.use(errorMiddleware);
  return app;
}
