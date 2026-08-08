import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/app/session/SessionContext.jsx';
import RequireAuth from '../../src/app/RequireAuth.jsx';
import Settings from '../../src/app/routes/Settings.jsx';
import { resetCsrfToken } from '../../src/lib/apiClient.js';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

// Settings only ever mounts behind RequireAuth in the real router, which blocks rendering
// until the session's initial /auth/me resolves. Rendering it standalone would let it mount
// before activeProfile is known and race its own data-loading effect — wrap with the real
// gate so the test matches production composition.
function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <SessionProvider>
        <RequireAuth>
          <Settings />
        </RequireAuth>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('Settings', () => {
  beforeEach(() => {
    resetCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists profiles, pre-fills the active Profile for editing, and switches on request', async () => {
    const rolesById = { p1: 'freelancer', p2: 'client' };
    const namesById = { p1: 'Mina', p2: 'Aster Labs' };
    let activeId = 'p1';
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) {
        return jsonResponse({
          identityId: '1',
          email: 'a@b.com',
          emailVerified: true,
          activeProfile: { id: activeId, role: rolesById[activeId] },
        });
      }
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.endsWith('/auth/profiles') && init.method === 'GET') {
        return jsonResponse([
          { id: 'p1', role: 'freelancer', displayName: 'Mina' },
          { id: 'p2', role: 'client', displayName: 'Aster Labs' },
        ]);
      }
      if (href.endsWith(`/profiles/${activeId}`)) {
        return jsonResponse({
          id: activeId,
          role: rolesById[activeId],
          displayName: namesById[activeId],
        });
      }
      if (href.endsWith('/auth/switch-profile')) {
        activeId = 'p2';
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderSettings();
    const user = userEvent.setup();

    expect(await screen.findByText('Your profiles')).toBeInTheDocument();
    expect(screen.getByText(/Mina — freelancer/)).toBeInTheDocument();
    expect(screen.getByText(/Aster Labs — client/)).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Mina');

    await user.click(screen.getByRole('button', { name: 'Switch' }));

    expect(await screen.findByLabelText('Business name')).toBeInTheDocument();
  });

  it('shows the no-active-Profile empty state when onboarding is not finished', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) {
        return jsonResponse({
          identityId: '1',
          email: 'a@b.com',
          emailVerified: true,
          activeProfile: null,
        });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderSettings();

    expect(await screen.findByText('No active Profile')).toBeInTheDocument();
  });
});
