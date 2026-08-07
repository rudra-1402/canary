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

// payload: { title, category, description, skills, jobType, budgetOrRate, experienceLevel,
// projectLength, hoursPerWeek?, screeningQuestions?, action: 'save_draft' | 'publish' }
export function createJobPost(payload) {
  return apiRequest('/jobposts', { method: 'POST', body: payload });
}

// Owner-only. patch may include an action transition: 'save_draft' | 'publish' | 'close'.
export function updateJobPost(id, patch) {
  return apiRequest(`/jobposts/${id}`, { method: 'PATCH', body: patch });
}

// Owner-only. query: { status, q, page, pageSize }
export function listMyJobPosts(query = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
  const qs = params.toString();
  return apiRequest(`/me/jobposts${qs ? `?${qs}` : ''}`);
}

// Pre-Proposal RiskAssessment preview. Idempotent per (Freelancer, JobPost, input hash) on
// the server; recompute:true forces a fresh score after JobPost terms or trust inputs change.
export function requestRiskPreview(jobPostId, { recompute = false } = {}) {
  return apiRequest(`/jobposts/${jobPostId}/risk-preview`, { method: 'POST', body: { recompute } });
}
