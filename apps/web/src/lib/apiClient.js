// Thin fetch wrapper: base URL, credentials, CSRF header, typed error.
// One CSRF token is fetched lazily and cached; the session cookie is what
// actually authenticates, the CSRF token only proves same-origin intent.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfTokenPromise = null;

async function getCsrfToken() {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch(`${BASE_URL}/auth/csrf-token`, { credentials: 'include' })
      .then((res) => res.json())
      .then((body) => body.csrfToken);
  }
  return csrfTokenPromise;
}

// Call after a successful login/logout — the session (and therefore the
// synchroniser token tied to it) has just changed.
export function resetCsrfToken() {
  csrfTokenPromise = null;
}

async function parseErrorBody(res) {
  try {
    const body = await res.json();
    return {
      message: body.message || body.error || res.statusText,
      code: body.error,
      details: body.details,
    };
  } catch {
    return { message: res.statusText };
  }
}

/**
 * @param {string} path - e.g. '/jobposts'
 * @param {object} [options]
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [options.method]
 * @param {object} [options.body]
 */
export async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, credentials: 'include', headers };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  if (method !== 'GET') {
    headers['x-csrf-token'] = await getCsrfToken();
  }

  const res = await fetch(`${BASE_URL}${path}`, init);

  if (!res.ok) {
    const { message, code, details } = await parseErrorBody(res);
    throw new ApiError(message, { status: res.status, code, details });
  }

  if (res.status === 204) return null;
  return res.json();
}
