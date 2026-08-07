import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Work from '../../src/app/routes/Work.jsx';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

function renderWork() {
  return render(
    <MemoryRouter>
      <Work />
    </MemoryRouter>,
  );
}

describe('Work', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Proposals by default and switches to Engagements on tab click', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/me/proposals')) {
        return jsonResponse({
          data: [
            {
              id: 'p1',
              bid: 900,
              payModel: 'project',
              proposedMilestones: [],
              proposedDurationDays: 10,
              screeningAnswers: [],
              status: 'submitted',
              createdAt: null,
              jobPost: { id: 'jp1', title: 'Landing page', status: 'open' },
            },
          ],
        });
      }
      if (href.includes('/me/engagements')) {
        return jsonResponse({
          data: [
            {
              id: 'e1',
              counterpartyProfileId: 'c1',
              jobPostId: 'jp1',
              proposalId: 'p1',
              status: 'active',
              agreedTerms: null,
              createdAt: null,
            },
          ],
        });
      }
      if (href.includes('/profiles/c1'))
        return jsonResponse({ id: 'c1', displayName: 'Aster Labs' });
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderWork();
    const user = userEvent.setup();

    expect(await screen.findByText('Landing page')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Engagements/ }));
    expect(await screen.findByText('Aster Labs')).toBeInTheDocument();
  });
});
