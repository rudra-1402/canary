import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EngagementDetail from '../../src/app/routes/EngagementDetail.jsx';
import * as SessionContext from '../../src/app/session/SessionContext.jsx';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

const ENGAGEMENT_ID = '6a6e4df05a26359d9f11e5a1';

const ENGAGEMENT = {
  id: ENGAGEMENT_ID,
  status: 'active',
  freelancerProfileId: 'f1',
  clientProfileId: 'c1',
  jobPostId: 'jp1',
  proposalId: 'prop1',
  agreedTerms: {
    scope: 'Rebuild onboarding',
    price: 3200,
    paymentTerms: 'net-15',
    timeline: '3 weeks',
    dueAt: '2026-09-01T00:00:00.000Z',
    revisionsIncluded: 2,
  },
  proposedTerms: {
    scope: 'Rebuild onboarding',
    price: 3200,
    paymentTerms: 'net-15',
    timeline: '3 weeks',
    dueAt: '2026-09-01T00:00:00.000Z',
    revisionsIncluded: 2,
  },
  createdAt: '2026-08-01T00:00:00.000Z',
  acceptedAt: '2026-08-02T00:00:00.000Z',
  concludedAt: null,
  jobPost: { id: 'jp1', title: 'Onboarding rebuild' },
  proposal: { id: 'prop1', status: 'accepted', bid: 3200 },
  parties: {
    freelancer: { id: 'f1', role: 'freelancer', displayName: 'Mina' },
    client: { id: 'c1', role: 'client', displayName: 'Aster Labs' },
  },
  trustByParty: {
    freelancer: { status: 'scored', profileId: 'f1', band: 'BAND_HIGH', score: 88 },
    client: { status: 'insufficient-history', profileId: 'c1', outcomeCount: 0, outcomesNeeded: 3 },
  },
  riskAssessment: {
    id: 'ra1',
    engagementId: ENGAGEMENT_ID,
    status: 'current',
    score: 20,
    level: 'low',
    verdict: 'proceed',
    confidence: 0.8,
    explanation: 'Terms are clear.',
    signals: [],
    generatedAt: '2026-08-02T00:00:00.000Z',
    inputVersion: 'sha256:x',
    modelVersion: 'risk-deterministic-v1',
  },
  outcomeEligibility: true,
  allowedActions: ['submit-outcome-review'],
  timeline: [
    { event: 'prospective-created', at: '2026-08-01T00:00:00.000Z' },
    { event: 'accepted', at: '2026-08-02T00:00:00.000Z' },
  ],
};

function renderDetail(id = ENGAGEMENT_ID) {
  return render(
    <MemoryRouter initialEntries={[`/engagements/${id}`]}>
      <Routes>
        <Route path="/engagements/:id" element={<EngagementDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EngagementDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows both parties, agreed terms, RiskAssessment, timeline, and a Record outcome link when eligible', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'f1', role: 'freelancer' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/engagements/${ENGAGEMENT_ID}`)) {
        return jsonResponse({ data: { engagement: ENGAGEMENT } });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Onboarding rebuild' })).toBeInTheDocument();
    expect(screen.getByText('Mina')).toBeInTheDocument();
    expect(screen.getByText('Aster Labs')).toBeInTheDocument();
    expect(screen.getByText(/High trust/)).toBeInTheDocument();
    expect(screen.getByText('proceed')).toBeInTheDocument();
    expect(screen.getByText('Terms are clear.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record outcome as freelancer' })).toHaveAttribute(
      'href',
      `/engagements/${ENGAGEMENT_ID}/review`,
    );
  });

  it('hides the Record outcome link when not eligible', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'f1', role: 'freelancer' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/engagements/${ENGAGEMENT_ID}`)) {
        return jsonResponse({
          data: { engagement: { ...ENGAGEMENT, outcomeEligibility: false, allowedActions: [] } },
        });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderDetail();

    await screen.findByRole('heading', { name: 'Onboarding rebuild' });
    expect(screen.queryByRole('link', { name: /Record outcome/ })).not.toBeInTheDocument();
  });

  it('shows the not-found state for a 403/404', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'f1', role: 'freelancer' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/engagements/${ENGAGEMENT_ID}`)) {
        return jsonResponse({ error: 'ForbiddenError' }, 403);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderDetail();

    expect(await screen.findByText('Engagement not found')).toBeInTheDocument();
  });
});
