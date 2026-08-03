import { apiRequest } from '../apiClient.js';

// All of the signed-in user's Engagements (any status), each already resolved
// to "my side" vs "the other party" via counterpartyProfileId. No per-status
// filter on the endpoint — callers filter client-side.
export function listMyEngagements() {
  return apiRequest('/me/engagements');
}
