import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/app/session/SessionContext.jsx';
import SignUp from '../../src/app/routes/SignUp.jsx';
import { resetCsrfToken } from '../../src/lib/apiClient.js';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

function renderSignUp() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <SessionProvider>
        <SignUp />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('SignUp', () => {
  beforeEach(() => {
    resetCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a session for a genuinely new email instead of showing the anti-enumeration message', async () => {
    let registered = false;
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) {
        return jsonResponse(
          registered
            ? {
                identityId: '1',
                email: 'new@example.com',
                emailVerified: false,
                activeProfile: null,
              }
            : {},
          registered ? 200 : 401,
        );
      }
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.endsWith('/auth/register')) {
        registered = true;
        return jsonResponse({ ok: true }, 201);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderSignUp();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.queryByText('Check your email')).not.toBeInTheDocument());
  });

  it('shows the anti-enumeration message for an email that is already registered', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) return jsonResponse({}, 401);
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.endsWith('/auth/register')) return jsonResponse({ ok: true }, 201);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderSignUp();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'existing@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-strong-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('existing@example.com')).toBeInTheDocument();
  });
});
