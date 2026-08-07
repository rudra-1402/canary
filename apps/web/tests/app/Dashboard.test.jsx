import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../../src/app/routes/Dashboard.jsx';
import * as SessionContext from '../../src/app/session/SessionContext.jsx';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe('Dashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Client-scoped stats composed from already-integrated endpoints', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'c1', role: 'client' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/me/jobposts')) {
        return jsonResponse({
          data: [
            {
              id: 'jp1',
              title: 'Landing page',
              proposalCounts: {
                submitted: 2,
                shortlisted: 0,
                accepted: 0,
                declined: 0,
                withdrawn: 0,
                total: 2,
              },
            },
          ],
          pagination: { page: 1, pageSize: 50, total: 1 },
        });
      }
      if (href.includes('/me/engagements')) {
        return jsonResponse({
          data: [{ id: 'e1', status: 'active', counterpartyProfileId: 'f1' }],
        });
      }
      if (href.includes('/trust-scores/c1')) {
        return jsonResponse({
          status: 'insufficient-history',
          profileId: 'c1',
          outcomeCount: 0,
          outcomesNeeded: 3,
        });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderDashboard();

    expect(await screen.findByText('My JobPosts')).toBeInTheDocument();
    expect(screen.getByText('New Proposals')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a JobPost' })).toHaveAttribute(
      'href',
      '/job-posts/new',
    );
  });
});
