import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/app/session/SessionContext.jsx';
import Onboarding from '../../src/app/routes/Onboarding.jsx';
import { resetCsrfToken } from '../../src/lib/apiClient.js';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <SessionProvider>
        <Onboarding />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('Onboarding', () => {
  beforeEach(() => {
    resetCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a Profile-less Identity choose a role and create a Profile, then reports missing fields after saving', async () => {
    let hasProfile = false;
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) {
        return jsonResponse({
          identityId: '1',
          email: 'a@b.com',
          emailVerified: true,
          activeProfile: hasProfile ? { id: 'p1', role: 'freelancer' } : null,
        });
      }
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.endsWith('/auth/profiles') && init?.method === 'POST') {
        hasProfile = true;
        return jsonResponse({ id: 'p1', role: 'freelancer' }, 201);
      }
      if (href.endsWith('/profiles/p1') && init?.method === 'PATCH') {
        return jsonResponse({
          profile: { id: 'p1', role: 'freelancer', displayName: 'Mina', discoverable: false },
          onboarding: { complete: false, missingFields: ['bio', 'skills'] },
        });
      }
      // The `load` effect re-runs once activeProfile becomes non-null after refresh(),
      // re-fetching the just-created Profile to render server-confirmed state.
      if (href.endsWith('/profiles/p1') && (!init || init.method === 'GET')) {
        return jsonResponse({ id: 'p1', role: 'freelancer', displayName: 'Mina' });
      }
      throw new Error(`Unhandled fetch: ${href} ${init?.method}`);
    });

    renderOnboarding();
    const user = userEvent.setup();

    expect(await screen.findByText('How will you use Canary?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Freelancer' }));
    await user.type(screen.getByLabelText('Display name'), 'Mina');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Complete your Profile')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Save and check completion/ }));

    expect(await screen.findByText('Still needed:')).toBeInTheDocument();
    expect(screen.getByText('bio')).toBeInTheDocument();
    expect(screen.getByText('skills')).toBeInTheDocument();
  });

  it('shows the field editor directly for an Identity that already has an active Profile', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.endsWith('/auth/me')) {
        return jsonResponse({
          identityId: '1',
          email: 'a@b.com',
          emailVerified: true,
          activeProfile: { id: 'p1', role: 'freelancer' },
        });
      }
      if (href.endsWith('/profiles/p1')) {
        return jsonResponse({ id: 'p1', role: 'freelancer', displayName: 'Mina' });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderOnboarding();

    expect(await screen.findByText('Complete your Profile')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Mina');
  });
});
