import { apiRequest, resetCsrfToken } from '../apiClient.js';

export async function login(email, password) {
  const result = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
  resetCsrfToken();
  return result;
}

export async function register(email, password, { firstName, lastName } = {}) {
  const result = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      email,
      password,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    },
  });
  resetCsrfToken();
  return result;
}

export function resendVerification(email) {
  return apiRequest('/auth/resend-verification', { method: 'POST', body: { email } });
}

export async function logout() {
  const result = await apiRequest('/auth/logout', { method: 'POST' });
  resetCsrfToken();
  return result;
}

export function getMe() {
  return apiRequest('/auth/me');
}

export function listProfiles() {
  return apiRequest('/auth/profiles');
}

export function createProfile(role, displayName) {
  return apiRequest('/auth/profiles', { method: 'POST', body: { role, displayName } });
}

export function switchProfile(profileId) {
  return apiRequest('/auth/switch-profile', { method: 'POST', body: { profileId } });
}
