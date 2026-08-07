import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import JobDetail from '../../src/app/routes/JobDetail.jsx';
import { resetCsrfToken } from '../../src/lib/apiClient.js';
import * as SessionContext from '../../src/app/session/SessionContext.jsx';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

const JOB_ID = '6a6e4df05a26359d9f11e59a';
const CLIENT_ID = '6a6e4df05a26359d9f0f2cf4';

const REAL_JOB = {
  id: JOB_ID,
  clientProfileId: CLIENT_ID,
  title: 'Radio broadcast assistant',
  category: 'writing',
  description: 'Contain produce which suffer yet possible great.',
  skills: ['python', 'node'],
  jobType: 'fixed',
  budgetOrRate: 4555,
  experienceLevel: 'expert',
  projectLength: '1-to-3-months',
  screeningQuestions: ['Have you done this before?'],
  status: 'open',
  createdAt: '2026-08-01T19:49:24.899Z',
  proposalCount: 5,
};

const REAL_CLIENT = {
  id: CLIENT_ID,
  role: 'client',
  displayName: 'Harborview Media',
  paymentVerified: true,
  verificationStatus: 'id-verified',
  skills: [],
  portfolio: [],
  workHistory: [],
  certifications: [],
  languages: [],
  industry: 'Media',
  typicalBudget: 5000,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const REAL_TRUSTSCORE = {
  status: 'scored',
  profileId: CLIENT_ID,
  band: 'BAND_MED',
  score: 60.87,
  generatedAt: '2026-08-02T14:42:01.626Z',
  signals: [{ name: 'on-time-rate', direction: 'favorable', strength: 'STRENGTH_STRONG' }],
};

function renderJobDetail(path = `/jobs/${JOB_ID}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/jobs/:id" element={<JobDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JobDetail', () => {
  beforeEach(() => {
    resetCsrfToken();
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'viewer-profile', role: 'freelancer' } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders job spec, client info, and the trust score panel from real endpoints', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/jobposts/${JOB_ID}`)) return jsonResponse(REAL_JOB);
      if (href.includes(`/profiles/${CLIENT_ID}/reviews`)) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (href.includes(`/profiles/${CLIENT_ID}`)) return jsonResponse(REAL_CLIENT);
      if (href.includes(`/trust-scores/${CLIENT_ID}`)) return jsonResponse(REAL_TRUSTSCORE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderJobDetail();

    expect(
      await screen.findByRole('heading', { name: 'Radio broadcast assistant' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Contain produce which suffer/)).toBeInTheDocument();
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByText(/5 proposals/)).toBeInTheDocument();
    expect(screen.getByText('Harborview Media')).toBeInTheDocument();
    expect(screen.getByText('ID verified')).toBeInTheDocument();
    expect(screen.getByText('Media')).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText(/Med trust/)).toBeInTheDocument();
    expect(screen.getByText('on-time-rate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View full trust score detail' })).toHaveAttribute(
      'href',
      `/trust/${CLIENT_ID}`,
    );

    // Explicitly excluded per spec: no fabricated aggregate stats.
    expect(screen.queryByText(/hire rate/i)).not.toBeInTheDocument();
  });

  it('shows the proposal form for an authenticated freelancer viewing an open job', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/jobposts/${JOB_ID}`)) return jsonResponse(REAL_JOB);
      if (href.includes(`/profiles/${CLIENT_ID}/reviews`)) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (href.includes(`/profiles/${CLIENT_ID}`)) return jsonResponse(REAL_CLIENT);
      if (href.includes(`/trust-scores/${CLIENT_ID}`)) return jsonResponse(REAL_TRUSTSCORE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderJobDetail();

    await screen.findByRole('heading', { name: 'Radio broadcast assistant' });
    expect(screen.getByRole('button', { name: 'Submit proposal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Have you done this before?')).toBeInTheDocument();
  });

  it('generates a risk preview on request and shows its verdict, confidence, and signals', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const href = url.toString();
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.includes(`/jobposts/${JOB_ID}/risk-preview`)) {
        return jsonResponse({
          data: {
            engagement: {
              id: 'eng-1',
              status: 'prospective',
              freelancerProfileId: 'viewer-profile',
              clientProfileId: CLIENT_ID,
              jobPostId: JOB_ID,
              createdAt: '2026-08-07T00:00:00.000Z',
            },
            riskAssessment: {
              id: 'ra-1',
              engagementId: 'eng-1',
              status: 'current',
              score: 22,
              level: 'low',
              verdict: 'proceed',
              confidence: 0.72,
              explanation: 'Structured terms and available Party standing support proceeding.',
              signals: [
                {
                  code: 'CLEAR_SCOPE',
                  severity: 'positive',
                  label: 'Scope is specific',
                  evidence: '...',
                },
              ],
              generatedAt: '2026-08-07T00:00:00.000Z',
              inputVersion: 'sha256:x',
              modelVersion: 'risk-deterministic-v1',
            },
          },
        });
      }
      if (href.includes(`/jobposts/${JOB_ID}`)) return jsonResponse(REAL_JOB);
      if (href.includes(`/profiles/${CLIENT_ID}/reviews`)) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (href.includes(`/profiles/${CLIENT_ID}`)) return jsonResponse(REAL_CLIENT);
      if (href.includes(`/trust-scores/${CLIENT_ID}`)) return jsonResponse(REAL_TRUSTSCORE);
      throw new Error(`Unhandled fetch: ${href} ${init?.method}`);
    });

    renderJobDetail();
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Radio broadcast assistant' });
    await user.click(screen.getByRole('button', { name: 'Preview risk before proposing' }));

    expect(await screen.findByText('proceed')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('confidence 72%')).toBeInTheDocument();
    expect(screen.getByText('Scope is specific')).toBeInTheDocument();
  });

  it('hides the proposal form for a client viewer', async () => {
    SessionContext.useSession.mockReturnValue({
      identity: { activeProfile: { id: 'viewer-profile', role: 'client' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/jobposts/${JOB_ID}`)) return jsonResponse(REAL_JOB);
      if (href.includes(`/profiles/${CLIENT_ID}/reviews`)) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (href.includes(`/profiles/${CLIENT_ID}`)) return jsonResponse(REAL_CLIENT);
      if (href.includes(`/trust-scores/${CLIENT_ID}`)) return jsonResponse(REAL_TRUSTSCORE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderJobDetail();

    await screen.findByRole('heading', { name: 'Radio broadcast assistant' });
    expect(screen.queryByRole('button', { name: 'Submit proposal' })).not.toBeInTheDocument();
    expect(screen.getByText('Only freelancers can submit proposals.')).toBeInTheDocument();
    // Screening questions are only ever shown as part of answering them in the Proposal
    // form — a client viewer, who never sees that form, should not see them either.
    expect(screen.queryByText(/Have you done this before/)).not.toBeInTheDocument();
  });

  it('shows an honest "no score yet" panel without fabricating a score', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/jobposts/${JOB_ID}`)) return jsonResponse(REAL_JOB);
      if (href.includes(`/profiles/${CLIENT_ID}/reviews`)) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (href.includes(`/profiles/${CLIENT_ID}`)) return jsonResponse(REAL_CLIENT);
      if (href.includes(`/trust-scores/${CLIENT_ID}`)) {
        return jsonResponse({
          status: 'insufficient-history',
          profileId: CLIENT_ID,
          outcomeCount: 1,
          outcomesNeeded: 3,
        });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderJobDetail();

    await screen.findByRole('heading', { name: 'Radio broadcast assistant' });
    expect(screen.getByText('No score yet.')).toBeInTheDocument();
  });

  it('shows the not-found state for an absent job', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/jobposts/${JOB_ID}`)) {
        return jsonResponse({ error: 'NotFoundError' }, 404);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderJobDetail();

    expect(await screen.findByText('Job post not found')).toBeInTheDocument();
  });

  it('shows an error state with retry when the job post request fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/jobposts/${JOB_ID}`)) {
        return jsonResponse({ error: 'InternalServerError' }, 500);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderJobDetail();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows the empty state for a job with no reviews yet', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/jobposts/${JOB_ID}`)) return jsonResponse(REAL_JOB);
      if (href.includes(`/profiles/${CLIENT_ID}/reviews`)) {
        return jsonResponse({ data: [], pagination: { page: 1, pageSize: 20, total: 0 } });
      }
      if (href.includes(`/profiles/${CLIENT_ID}`)) return jsonResponse(REAL_CLIENT);
      if (href.includes(`/trust-scores/${CLIENT_ID}`)) return jsonResponse(REAL_TRUSTSCORE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderJobDetail();

    expect(await screen.findByText('No reviews yet')).toBeInTheDocument();
  });
});
