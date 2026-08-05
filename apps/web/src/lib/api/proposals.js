import { apiRequest } from '../apiClient.js';

// payload: { jobPostId, bid, payModel, proposedDurationDays, proposedMilestones?,
// durationEstimate?, coverLetter?, screeningAnswers? }
export function createProposal(payload) {
  return apiRequest('/proposals', { method: 'POST', body: payload });
}
