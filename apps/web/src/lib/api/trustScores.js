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

// Single-profile read. Same auth requirement as the batch endpoint.
export function getTrustScore(profileId) {
  return apiRequest(`/trust-scores/${profileId}`);
}

// The outcome-history evidence behind a Trust Score. query: { page, pageSize }
export function listTrustScoreOutcomes(profileId, query = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
  const qs = params.toString();
  return apiRequest(`/trust-scores/${profileId}/outcomes${qs ? `?${qs}` : ''}`);
}
