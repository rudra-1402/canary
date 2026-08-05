import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TrustScoreDetail from '../../src/app/routes/TrustScoreDetail.jsx';
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

const PROFILE_ID = '6a6e4df05a26359d9f0f2cf4';

const REAL_PROFILE = {
  id: PROFILE_ID,
  role: 'freelancer',
  displayName: 'Avery Chen',
  paymentVerified: true,
  verificationStatus: 'id-verified',
  skills: ['react'],
  portfolio: [],
  workHistory: [],
  certifications: [],
  languages: [],
  createdAt: '2025-01-01T00:00:00.000Z',
};

const REAL_TRUSTSCORE = {
  status: 'scored',
  profileId: PROFILE_ID,
  band: 'BAND_MED',
  score: 60.87,
  generatedAt: '2026-08-02T14:42:01.626Z',
  signals: [
    { name: 'on-time-rate', direction: 'favorable', strength: 'STRENGTH_STRONG' },
    { name: 'ghost-rate', direction: 'unfavorable', strength: 'STRENGTH_WEAK' },
  ],
};

const REAL_OUTCOMES = {
  data: [
    {
      id: 'a'.repeat(24),
      subjectRole: 'freelancer',
      endedAs: 'completed',
      ghosted: false,
      daysLate: 0,
      recordedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1 },
};

const EMPTY_LIST = { data: [], pagination: { page: 1, pageSize: 20, total: 0 } };

function renderTrustScoreDetail(path = `/trust/${PROFILE_ID}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trust/:profileId" element={<TrustScoreDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFetch({
  profile = REAL_PROFILE,
  trustScore = REAL_TRUSTSCORE,
  outcomes = REAL_OUTCOMES,
  reviews = EMPTY_LIST,
  profileStatus = 200,
  trustScoreStatus = 200,
} = {}) {
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const href = url.toString();
    if (href.includes(`/profiles/${PROFILE_ID}/reviews`)) return jsonResponse(reviews);
    if (href.includes(`/profiles/${PROFILE_ID}`)) return jsonResponse(profile, profileStatus);
    if (href.includes(`/trust-scores/${PROFILE_ID}/outcomes`)) return jsonResponse(outcomes);
    if (href.includes(`/trust-scores/${PROFILE_ID}`))
      return jsonResponse(trustScore, trustScoreStatus);
    throw new Error(`Unhandled fetch: ${href}`);
  });
}

describe('TrustScoreDetail', () => {
  beforeEach(() => {
    resetCsrfToken();
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'someone-else' } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders subject, score, band, ranked signals, outcome evidence, and reviews', async () => {
    mockFetch();

    renderTrustScoreDetail();

    expect(await screen.findByText(/Avery Chen/)).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText(/Med trust/)).toBeInTheDocument();
    expect(screen.getByText('on-time-rate')).toBeInTheDocument();
    expect(screen.getByText('ghost-rate')).toBeInTheDocument();
    expect(screen.getByText(/Favorable/)).toBeInTheDocument();
    expect(screen.getByText(/Unfavorable/)).toBeInTheDocument();
    expect(screen.getByText(/completed/)).toBeInTheDocument();

    // The signal contract never carries a raw value/weight - only direction + strength.
    expect(screen.queryByText(/weight/i)).not.toBeInTheDocument();
  });

  it('shows the "how to improve" section only for the viewer\'s own profile', async () => {
    mockFetch();
    SessionContext.useSession.mockReturnValue({ identity: { activeProfile: { id: PROFILE_ID } } });

    renderTrustScoreDetail();

    await screen.findByText(/Avery Chen/);
    expect(screen.getByText('How to improve')).toBeInTheDocument();
    expect(screen.getByText(/These signals are currently working against/)).toBeInTheDocument();
  });

  it('hides the "how to improve" section for a counterparty viewer', async () => {
    mockFetch();

    renderTrustScoreDetail();

    await screen.findByText(/Avery Chen/);
    expect(screen.queryByText('How to improve')).not.toBeInTheDocument();
  });

  it('renders an honest "no score yet" message rather than a fabricated score', async () => {
    mockFetch({
      trustScore: {
        status: 'insufficient-history',
        profileId: PROFILE_ID,
        outcomeCount: 1,
        outcomesNeeded: 3,
      },
      outcomes: EMPTY_LIST,
    });

    renderTrustScoreDetail();

    expect(await screen.findByText(/No score yet/)).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('shows the empty state for no outcome history and no reviews', async () => {
    mockFetch({ outcomes: EMPTY_LIST, reviews: EMPTY_LIST });

    renderTrustScoreDetail();

    await screen.findByText(/Avery Chen/);
    expect(screen.getByText('No outcome history yet')).toBeInTheDocument();
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
  });

  it('shows the not-found state for an absent or inaccessible profile', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/trust-scores/${PROFILE_ID}`)) {
        return jsonResponse({ error: 'NotFoundError' }, 404);
      }
      if (href.includes(`/profiles/${PROFILE_ID}`)) return jsonResponse(REAL_PROFILE);
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderTrustScoreDetail();

    expect(await screen.findByText('Trust score not found')).toBeInTheDocument();
  });

  it('shows an error state with retry on an unexpected failure', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes(`/profiles/${PROFILE_ID}`)) {
        return jsonResponse({ error: 'InternalServerError' }, 500);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderTrustScoreDetail();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
