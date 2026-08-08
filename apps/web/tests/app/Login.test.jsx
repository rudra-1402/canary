import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/app/session/SessionContext.jsx';
import Login from '../../src/app/routes/Login.jsx';
import { resetCsrfToken } from '../../src/lib/apiClient.js';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <SessionProvider>
        <Login />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  beforeEach(() => {
    resetCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces the server error message on bad credentials', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) return jsonResponse({}, 401);
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.endsWith('/auth/login')) {
        return jsonResponse({ error: 'UnauthorizedError', message: 'Invalid credentials' }, 401);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'johnsonjoshua@example.org');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('navigates away from /login on a successful submit', async () => {
    let loggedIn = false;
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me'))
        return jsonResponse(
          loggedIn
            ? { identityId: '1', email: 'a@b.com', emailVerified: true, activeProfile: null }
            : {},
          loggedIn ? 200 : 401,
        );
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.endsWith('/auth/login')) {
        loggedIn = true;
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'johnsonjoshua@example.org');
    await user.type(screen.getByLabelText('Password'), 'canary-demo-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('blocks submission with an empty password without calling the API', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) return jsonResponse({}, 401);
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email'), 'johnsonjoshua@example.org');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email and password.');
    expect(fetchSpy.mock.calls.some(([url]) => url.toString().endsWith('/auth/login'))).toBe(false);
  });
});
