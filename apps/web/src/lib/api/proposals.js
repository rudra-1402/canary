import { apiRequest } from '../apiClient.js';

// payload: { jobPostId, bid, payModel, proposedDurationDays, proposedMilestones?,
// durationEstimate?, coverLetter?, screeningAnswers? }
export function createProposal(payload) {
  return apiRequest('/proposals', { method: 'POST', body: payload });
}

// Owner-only. query: { status, sort, page, pageSize }
export function listJobPostProposals(jobPostId, query = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
  const qs = params.toString();
  return apiRequest(`/jobposts/${jobPostId}/proposals${qs ? `?${qs}` : ''}`);
}

// Post-Proposal RiskAssessment — a Party (Client or Freelancer) reviewing an already-submitted
// Proposal, distinct from the pre-Proposal risk-preview on JobDetail.
export function requestProposalRiskAssessment(proposalId, { recompute = false } = {}) {
  return apiRequest(`/proposals/${proposalId}/risk-assessment`, {
    method: 'POST',
    body: { recompute },
  });
}

// Owner-only. Server refuses this when the controlling RiskAssessment is stale/missing/failed.
export function acceptProposal(proposalId) {
  return apiRequest(`/proposals/${proposalId}/accept`, { method: 'POST', body: { confirm: true } });
}

// Owner-only. reasonCode is a private, bounded code — never shown to the Freelancer.
export function declineProposal(proposalId, reasonCode) {
  return apiRequest(`/proposals/${proposalId}/decline`, {
    method: 'POST',
    body: reasonCode ? { reasonCode } : {},
  });
}
