import { apiRequest } from '../apiClient.js';

// query: { page, pageSize, category, jobType, experienceLevel, status, trackRecordOnly }
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

// Pre-Proposal RiskAssessment preview. Idempotent per (Freelancer, JobPost, input hash) on
// the server; recompute:true forces a fresh score after JobPost terms or trust inputs change.
export function requestRiskPreview(jobPostId, { recompute = false } = {}) {
  return apiRequest(`/jobposts/${jobPostId}/risk-preview`, { method: 'POST', body: { recompute } });
}
