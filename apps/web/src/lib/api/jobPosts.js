import { apiRequest } from '../apiClient.js';

// query: { page, pageSize, category, jobType, experienceLevel, status }
export function listJobPosts(query = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
  const qs = params.toString();
  return apiRequest(`/jobposts${qs ? `?${qs}` : ''}`);
}

export function getJobPostById(id) {
  return apiRequest(`/jobposts/${id}`);
}
