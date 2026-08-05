import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/app/App.jsx';
import { resetCsrfToken } from '../src/lib/apiClient.js';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetCsrfToken();
  });

  it('redirects an unauthenticated visitor to /login', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) return jsonResponse({ error: 'UnauthorizedError' }, 401);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    render(<App />);

    expect(await screen.findByText('Sign in to your account.')).toBeInTheDocument();
  });

  it('renders the authenticated shell for a logged-in session', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) {
        return jsonResponse({
          identityId: '1',
          email: 'johnsonjoshua@example.org',
          emailVerified: true,
          activeProfile: { id: 'p1', role: 'client' },
        });
      }
      if (href.includes('/jobposts')) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    render(<App />);

    expect(await screen.findByText('johnsonjoshua@example.org')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Find Work' })).toBeInTheDocument();
  });
});
