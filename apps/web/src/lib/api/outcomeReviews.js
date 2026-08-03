import { apiRequest } from '../apiClient.js';

// payload: { engagementId, outcome: { endedAs, ghosted, observed, daysLate?,
// paidInFull?, revisionsRequested?, scopeCreepOccurred? }, review: { rating, text? } }
// Writes an Outcome + Review for the caller's active Profile. A second call
// for the same party on the same engagement is rejected by the API — see
// outcomeReview.service.js for the exact message this throws.
export function submitOutcomeReview(payload) {
  return apiRequest('/outcome-reviews', { method: 'POST', body: payload });
}
