import { JobPostListQuerySchema, JobPostIdParamSchema } from '@canary/shared';
import * as jobPostService from './jobPost.service.js';

// Thin HTTP adapters: parse the request against the contract, call the service, respond.
// No try/catch — Express 5 forwards Zod/service errors to the error middleware.
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
