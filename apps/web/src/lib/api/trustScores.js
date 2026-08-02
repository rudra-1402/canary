import { apiRequest } from '../apiClient.js';

// Batch endpoint, max 50 distinct ids. Requires an authenticated marketplace
// Profile — callers must be prepared for this to fail even when the caller
// is logged in (e.g. no Profile yet), and treat it as "band unavailable"
// rather than a page-level error.
export function getTrustScoresBatch(profileIds) {
  const unique = [...new Set(profileIds)];
  if (unique.length === 0) return Promise.resolve({ data: [] });
  return apiRequest(`/trust-scores?profileIds=${unique.join(',')}`);
}
