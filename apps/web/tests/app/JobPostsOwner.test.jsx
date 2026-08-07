import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import JobPostsOwner from '../../src/app/routes/JobPostsOwner.jsx';
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
      <JobPostsOwner />
    </MemoryRouter>,
  );
}

const JOB_POST = {
  id: 'jp1',
  clientProfileId: 'client-1',
  title: 'Dashboard redesign',
  category: 'design',
  description: 'Redesign the analytics dashboard.',
  skills: [],
  jobType: 'fixed',
  budgetOrRate: 1200,
  experienceLevel: 'intermediate',
  projectLength: 'less-than-1-month',
  screeningQuestions: [],
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  proposalCounts: {
    submitted: 1,
    shortlisted: 0,
    accepted: 0,
    declined: 0,
    withdrawn: 0,
    total: 1,
  },
};

const PROPOSAL_NO_RISK = {
  id: 'prop1',
  jobPostId: 'jp1',
  bid: 1150,
  payModel: 'project',
  proposedMilestones: [],
  proposedDurationDays: 14,
  screeningAnswers: [],
  status: 'submitted',
  createdAt: '2026-08-02T00:00:00.000Z',
  freelancer: {
    id: 'f1',
    role: 'freelancer',
    displayName: 'Mina',
    paymentVerified: false,
    verificationStatus: 'none',
    skills: [],
    portfolio: [],
    workHistory: [],
    certifications: [],
    languages: [],
    createdAt: null,
  },
  trustScore: {
    status: 'insufficient-history',
    profileId: 'f1',
    outcomeCount: 0,
    outcomesNeeded: 3,
  },
  prospectiveEngagementId: null,
  riskAssessment: null,
};

describe('JobPostsOwner', () => {
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

  it('lists owned JobPosts, selects one, and blocks Accept until a RiskAssessment exists', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'client-1', role: 'client' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/me/jobposts')) {
        return jsonResponse({ data: [JOB_POST], pagination: { page: 1, pageSize: 50, total: 1 } });
      }
      if (href.includes('/jobposts/jp1/proposals')) {
        return jsonResponse({
          data: [PROPOSAL_NO_RISK],
          pagination: { page: 1, pageSize: 50, total: 1 },
        });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderPage();

    expect(await screen.findByText('Dashboard redesign')).toBeInTheDocument();
    expect(await screen.findByText('Mina')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByText('Generate a RiskAssessment before accepting.')).toBeInTheDocument();
  });

  it('enables Accept once a current RiskAssessment is generated, and requires confirmation', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'client-1', role: 'client' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const href = url.toString();
      if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
      if (href.includes('/me/jobposts')) {
        return jsonResponse({ data: [JOB_POST], pagination: { page: 1, pageSize: 50, total: 1 } });
      }
      if (href.includes('/jobposts/jp1/proposals')) {
        return jsonResponse({
          data: [PROPOSAL_NO_RISK],
          pagination: { page: 1, pageSize: 50, total: 1 },
        });
      }
      if (href.includes('/proposals/prop1/risk-assessment') && init?.method === 'POST') {
        return jsonResponse({
          data: {
            engagement: { id: 'eng1', status: 'prospective' },
            riskAssessment: {
              id: 'ra1',
              engagementId: 'eng1',
              status: 'current',
              score: 18,
              level: 'low',
              verdict: 'proceed',
              confidence: 0.8,
              explanation: 'Looks fine.',
              signals: [],
              generatedAt: '2026-08-02T00:00:00.000Z',
              inputVersion: 'sha256:x',
              modelVersion: 'risk-deterministic-v1',
            },
          },
        });
      }
      throw new Error(`Unhandled fetch: ${href} ${init?.method}`);
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Mina');
    await user.click(screen.getByRole('button', { name: 'Generate risk assessment' }));

    expect(await screen.findByRole('button', { name: 'Accept' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('button', { name: 'Confirm accept' })).toBeInTheDocument();
  });
});
