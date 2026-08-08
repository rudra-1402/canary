import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import JobPostNew from '../../src/app/routes/JobPostNew.jsx';
import * as SessionContext from '../../src/app/session/SessionContext.jsx';
import { resetCsrfToken } from '../../src/lib/apiClient.js';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <JobPostNew />
    </MemoryRouter>,
  );
}

describe('JobPostNew', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetCsrfToken();
  });

  it('gates the route for a non-Client viewer', () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'f1', role: 'freelancer' } },
    });

    renderPage();

    expect(screen.getByText('Client Profile required')).toBeInTheDocument();
  });

  it('publishes a JobPost and confirms', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'c1', role: 'client' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const href = url.toString();
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.endsWith('/jobposts') && init?.method === 'POST') {
        return jsonResponse({ id: 'jp1', status: 'open' }, 201);
      }
      throw new Error(`Unhandled fetch: ${href} ${init?.method}`);
    });

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'Landing page redesign');
    await user.type(screen.getByLabelText('Category'), 'Design');
    await user.type(screen.getByLabelText('Description'), 'Redesign the marketing landing page.');
    await user.type(screen.getByLabelText(/Budget/), '1500');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('JobPost published.')).toBeInTheDocument();
  });
});
