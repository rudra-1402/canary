import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FindWork from '../../src/app/routes/FindWork.jsx';
import { resetCsrfToken } from '../../src/lib/apiClient.js';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

// A real GET /api/jobposts response shape (JobPostListResponseSchema).
const REAL_JOBPOSTS_RESPONSE = {
  data: [
    {
      id: '6a6e4df05a26359d9f11e59a',
      clientProfileId: '6a6e4df05a26359d9f0f2cf4',
      title: 'Radio broadcast assistant',
      category: 'writing',
      description: 'Contain produce which suffer yet possible great.',
      skills: ['python', 'node'],
      jobType: 'fixed',
      budgetOrRate: 4555,
      experienceLevel: 'expert',
      projectLength: '1-to-3-months',
      screeningQuestions: [],
      status: 'open',
      createdAt: '2026-08-01T19:49:24.899Z',
      proposalCount: 5,
      clientDisplayName: 'Harborview Media',
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1 },
};

// A real GET /api/trust-scores batch response (TrustScoreBatchResponseSchema).
const REAL_TRUSTSCORES_RESPONSE = {
  data: [
    {
      status: 'scored',
      profileId: '6a6e4df05a26359d9f0f2cf4',
      band: 'BAND_MED',
      score: 60.87,
      generatedAt: '2026-08-02T14:42:01.626Z',
    },
  ],
};

describe('FindWork', () => {
  beforeEach(() => {
    resetCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders real job posts with the client trust band, skills, and proposal count', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/jobposts')) return jsonResponse(REAL_JOBPOSTS_RESPONSE);
      if (href.includes('/trust-scores')) return jsonResponse(REAL_TRUSTSCORES_RESPONSE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    render(<FindWork />);

    const item = await screen.findByText('Radio broadcast assistant');
    const row = item.closest('li');
    expect(within(row).getByText(/Med trust/)).toBeInTheDocument();
    expect(within(row).getByText(/\$4,555/)).toBeInTheDocument();
    expect(within(row).getByText('python')).toBeInTheDocument();
    expect(within(row).getByText('node')).toBeInTheDocument();
    expect(within(row).getByText(/5 proposals/)).toBeInTheDocument();

    // The client's name must appear on the card, and the trust pill must read as
    // belonging to that named client, not to the job post or a freelancer.
    const clientName = within(row).getByText('Harborview Media');
    expect(clientName).toBeInTheDocument();
    const badge = within(row).getByText(/Med trust/);
    // Name and badge are grouped together in one shared container -- that's what
    // makes ownership legible without any caller having to be told.
    const sharedGroup = clientName.closest('div');
    expect(sharedGroup).toContainElement(badge);
  });

  it('requests trackRecordOnly=true by default', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/jobposts')) return jsonResponse(REAL_JOBPOSTS_RESPONSE);
      if (href.includes('/trust-scores')) return jsonResponse(REAL_TRUSTSCORES_RESPONSE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    render(<FindWork />);
    await screen.findByText('Radio broadcast assistant');

    const jobPostCall = global.fetch.mock.calls.find(([url]) =>
      url.toString().includes('/jobposts'),
    );
    expect(jobPostCall[0].toString()).toContain('trackRecordOnly=true');
  });

  it('shows a "Clients with a track record" toggle, checked by default, and refetches with trackRecordOnly=false when unchecked', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/jobposts')) return jsonResponse(REAL_JOBPOSTS_RESPONSE);
      if (href.includes('/trust-scores')) return jsonResponse(REAL_TRUSTSCORES_RESPONSE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    const user = userEvent.setup();
    render(<FindWork />);
    await screen.findByText('Radio broadcast assistant');

    const toggle = screen.getByRole('checkbox', { name: /Clients with a track record/i });
    expect(toggle).toBeChecked();

    global.fetch.mockClear();
    await user.click(toggle);

    await waitFor(() => {
      const jobPostCall = global.fetch.mock.calls.find(([url]) =>
        url.toString().includes('/jobposts'),
      );
      expect(jobPostCall[0].toString()).toContain('trackRecordOnly=false');
    });
    expect(toggle).not.toBeChecked();
  });

  it('shows the empty state when there are no open job posts', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/jobposts')) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    render(<FindWork />);

    expect(await screen.findByText('No open job posts right now')).toBeInTheDocument();
  });

  it('shows an error state when the job posts request fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/jobposts')) {
        return jsonResponse({ error: 'InternalServerError' }, 500);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    render(<FindWork />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('still renders the list when the trust-scores batch call fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/jobposts')) return jsonResponse(REAL_JOBPOSTS_RESPONSE);
      if (href.includes('/trust-scores')) {
        return jsonResponse(
          { error: 'ForbiddenError', message: 'Requires a marketplace Profile' },
          403,
        );
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    render(<FindWork />);

    const item = await screen.findByText('Radio broadcast assistant');
    const row = item.closest('li');
    expect(within(row).getByText('No score yet')).toBeInTheDocument();
  });
});
