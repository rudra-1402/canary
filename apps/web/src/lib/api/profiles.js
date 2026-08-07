import { apiRequest } from '../apiClient.js';

export function getProfile(id) {
  return apiRequest(`/profiles/${id}`);
}

export function updateProfile(id, patch) {
  return apiRequest(`/profiles/${id}`, { method: 'PATCH', body: patch });
}

// query: { page, pageSize }
export function listProfileReviews(id, query = {}) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
  const qs = params.toString();
  return apiRequest(`/profiles/${id}/reviews${qs ? `?${qs}` : ''}`);
}
