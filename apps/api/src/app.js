import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getHealthStatus } from './health.js';
import jobPostRouter from './jobPost/jobPost.routes.js';
import { errorMiddleware } from './lib/errorMiddleware.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json(getHealthStatus());
  });

  app.use('/api/jobposts', jobPostRouter);

  app.use(errorMiddleware);

  return app;
}
