import { apiRequest, resetCsrfToken } from '../apiClient.js';

export async function login(email, password) {
  const result = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
  resetCsrfToken();
  return result;
}

export async function logout() {
  const result = await apiRequest('/auth/logout', { method: 'POST' });
  resetCsrfToken();
  return result;
}

export function getMe() {
  return apiRequest('/auth/me');
}
