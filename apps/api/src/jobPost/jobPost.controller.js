import { JobPostListQuerySchema, JobPostIdParamSchema } from '@canary/shared';
import * as jobPostService from './jobPost.service.js';

// Thin HTTP adapters. Parse the request against the contract, delegate to the
// service, send the result. No try/catch — Zod throws and service errors are
// forwarded to the error middleware by Express 5's native async handling.
export async function list(req, res) {
  const query = JobPostListQuerySchema.parse(req.query);
  const result = await jobPostService.listJobPosts(query);
  res.json(result);
}

export async function getById(req, res) {
  const { id } = JobPostIdParamSchema.parse(req.params);
  const jobPost = await jobPostService.getJobPostById(id);
  res.json(jobPost);
}
