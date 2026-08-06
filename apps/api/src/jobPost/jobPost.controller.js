import {
  CreateJobPostRequestSchema,
  JobPostListQuerySchema,
  JobPostIdParamSchema,
  UpdateJobPostRequestSchema,
  JobPostProposalListQuerySchema,
} from '@canary/shared';
import { getCurrentUser } from '../auth/getCurrentUser.js';
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

export async function create(req, res) {
  const input = CreateJobPostRequestSchema.parse(req.body);
  const { activeProfile } = getCurrentUser(req);
  const jobPost = await jobPostService.createJobPost(input, activeProfile.id);
  res.status(201).json(jobPost);
}

export async function update(req, res) {
  const { id } = JobPostIdParamSchema.parse(req.params);
  const input = UpdateJobPostRequestSchema.parse(req.body);
  const { activeProfile } = getCurrentUser(req);
  const jobPost = await jobPostService.updateOwnedJobPost(id, activeProfile.id, input);
  res.json(jobPost);
}

export async function listProposals(req, res) {
  const { id } = JobPostIdParamSchema.parse(req.params);
  const query = JobPostProposalListQuerySchema.parse(req.query);
  const { activeProfile } = getCurrentUser(req);
  const proposals = await jobPostService.listOwnedJobPostProposals(id, activeProfile.id, query);
  res.json(proposals);
}
