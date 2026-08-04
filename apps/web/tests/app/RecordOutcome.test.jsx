import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RecordOutcome from '../../src/app/routes/RecordOutcome.jsx';
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

const ENGAGEMENT_ID = '6a6e4df05a26359d9f11e5a1';
const COUNTERPARTY_ID = '6a6e4df05a26359d9f0f2cf4';
const OUTCOME_ID = '6a6e4df05a26359d9f11e5b1';
const REVIEW_ID = '6a6e4df05a26359d9f11e5b2';

const AGREED_TERMS = {
  scope: 'Rebuild the onboarding flow',
  price: 3200,
  paymentTerms: 'net-15',
  timeline: '3 weeks',
  revisionsIncluded: 2,
};

function activeEngagement(overrides = {}) {
  return {
    id: ENGAGEMENT_ID,
    counterpartyProfileId: COUNTERPARTY_ID,
    jobPostId: null,
    proposalId: null,
    status: 'active',
    agreedTerms: AGREED_TERMS,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockFetch({ engagements, profile, postHandler }) {
  return vi.spyOn(global, 'fetch').mockImplementation((url, init = {}) => {
    const href = url.toString();
    if (href.includes('/me/engagements')) return jsonResponse({ data: engagements });
    if (href.includes(`/profiles/${COUNTERPARTY_ID}`)) return jsonResponse(profile);
    if (href.endsWith('/auth/csrf-token')) return jsonResponse({ csrfToken: 'test-token' });
    if (href.includes('/outcome-reviews') && init.method === 'POST') {
      return postHandler
        ? postHandler(init)
        : Promise.reject(new Error('no postHandler configured'));
    }
    throw new Error(`Unhandled fetch: ${href} ${init.method || 'GET'}`);
  });
}

function renderScreen(role = 'freelancer') {
  vi.spyOn(SessionContext, 'useSession').mockReturnValue({
    identity: { activeProfile: { id: 'viewer-profile-id', role } },
  });
  return render(
    <MemoryRouter initialEntries={[`/engagements/${ENGAGEMENT_ID}/review`]}>
      <Routes>
        <Route path="/engagements/:id/review" element={<RecordOutcome />} />
      </Routes>
    </MemoryRouter>,
  );
}

const PROFILE = { id: COUNTERPARTY_ID, displayName: 'Harborview Media' };

describe('RecordOutcome', () => {
  beforeEach(() => {
    resetCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state before the engagement arrives', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    renderScreen();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry when the engagement list request fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/me/engagements'))
        return jsonResponse({ error: 'InternalServerError' }, 500);
      throw new Error(`Unhandled fetch: ${href}`);
    });
    renderScreen();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows a not-found state for an engagement the viewer is not party to', async () => {
    mockFetch({ engagements: [], profile: PROFILE });
    renderScreen();
    expect(await screen.findByText('Engagement not found')).toBeInTheDocument();
  });

  it('states the double-blind rule and recaps the real contract terms with the counterparty name', async () => {
    mockFetch({ engagements: [activeEngagement()], profile: PROFILE });
    renderScreen();

    expect((await screen.findAllByText(/Harborview Media/)).length).toBeGreaterThan(0);
    expect(screen.getByText('$3,200')).toBeInTheDocument();
    expect(screen.getByText('net-15')).toBeInTheDocument();
    expect(screen.getByText('3 weeks')).toBeInTheDocument();
    expect(
      screen.getByText(/stays hidden until .*Harborview Media.* submits theirs too/),
    ).toBeInTheDocument();
  });

  it('shows client-side conduct fields, not freelancer-side ones, for a freelancer viewer', async () => {
    mockFetch({ engagements: [activeEngagement()], profile: PROFILE });
    renderScreen('freelancer');

    await screen.findAllByText(/Harborview Media/);
    expect(screen.queryByLabelText(/Days late/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Paid in full/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Revisions requested/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Scope creep/i)).toBeInTheDocument();
  });

  it('shows freelancer-side conduct fields, not client-side ones, for a client viewer', async () => {
    mockFetch({ engagements: [activeEngagement()], profile: PROFILE });
    renderScreen('client');

    await screen.findAllByText(/Harborview Media/);
    expect(screen.getByLabelText(/Days late/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Paid in full/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Revisions requested/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Scope creep/i)).not.toBeInTheDocument();
  });

  it('submits counterparty conduct for both roles and keeps a ghosting report observed', async () => {
    const user = userEvent.setup();
    const submitted = [];
    const postHandler = (init) => {
      submitted.push(JSON.parse(init.body));
      return jsonResponse(
        { outcomeId: OUTCOME_ID, reviewId: REVIEW_ID, engagementStatus: 'active' },
        201,
      );
    };

    mockFetch({ engagements: [activeEngagement()], profile: PROFILE, postHandler });
    const first = renderScreen('client');
    await screen.findAllByText(/Harborview Media/);
    await user.type(screen.getByLabelText(/Days late/i), '3');
    await user.click(screen.getByRole('button', { name: /Submit outcome/i }));
    expect(submitted[0].outcome).toMatchObject({ daysLate: 3, observed: true });

    first.unmount();
    vi.restoreAllMocks();
    mockFetch({ engagements: [activeEngagement()], profile: PROFILE, postHandler });
    const second = renderScreen('freelancer');
    await screen.findAllByText(/Harborview Media/);
    await user.selectOptions(screen.getByLabelText(/Paid in full/i), 'yes');
    await user.selectOptions(screen.getByLabelText(/Scope creep/i), 'no');
    await user.click(screen.getByRole('button', { name: /Submit outcome/i }));
    expect(submitted[1].outcome).toMatchObject({
      paidInFull: true,
      scopeCreepOccurred: false,
      observed: true,
    });

    second.unmount();
    vi.restoreAllMocks();
    mockFetch({ engagements: [activeEngagement()], profile: PROFILE, postHandler });
    renderScreen('freelancer');
    await screen.findAllByText(/Harborview Media/);
    await user.click(screen.getByLabelText(/The other party stopped responding/i));
    await user.click(screen.getByRole('button', { name: /Submit outcome/i }));
    expect(submitted[2].outcome).toMatchObject({
      ghosted: true,
      observed: true,
    });
  });

  it('shows the already-concluded state directly when both sides have already submitted', async () => {
    mockFetch({ engagements: [activeEngagement({ status: 'concluded' })], profile: PROFILE });
    renderScreen();

    expect(await screen.findByText(/concluded/i)).toBeInTheDocument();
    expect(screen.getByText(/reviews are now visible/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit outcome/i })).not.toBeInTheDocument();
  });

  it('shows the "waiting for counterparty" state after a submission that leaves the engagement active', async () => {
    const user = userEvent.setup();
    mockFetch({
      engagements: [activeEngagement()],
      profile: PROFILE,
      postHandler: () =>
        jsonResponse(
          { outcomeId: OUTCOME_ID, reviewId: REVIEW_ID, engagementStatus: 'active' },
          201,
        ),
    });
    renderScreen('freelancer');

    await screen.findAllByText(/Harborview Media/);
    await user.selectOptions(screen.getByLabelText(/How did this engagement end/i), 'completed');
    await user.selectOptions(screen.getByLabelText(/Rating/i), '5');
    await user.click(screen.getByRole('button', { name: /Submit outcome/i }));

    expect(
      await screen.findByText(/Your side is recorded\. Waiting on Harborview Media/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit outcome/i })).not.toBeInTheDocument();
  });

  it('shows the "both sides in, concluded" state after the submission that completes the pair', async () => {
    const user = userEvent.setup();
    mockFetch({
      engagements: [activeEngagement()],
      profile: PROFILE,
      postHandler: () =>
        jsonResponse(
          { outcomeId: OUTCOME_ID, reviewId: REVIEW_ID, engagementStatus: 'concluded' },
          201,
        ),
    });
    renderScreen('freelancer');

    await screen.findAllByText(/Harborview Media/);
    await user.selectOptions(screen.getByLabelText(/How did this engagement end/i), 'completed');
    await user.selectOptions(screen.getByLabelText(/Rating/i), '4');
    await user.click(screen.getByRole('button', { name: /Submit outcome/i }));

    expect(
      await screen.findByText(/Both sides have submitted\. This engagement is concluded/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/reviews are now visible/i)).toBeInTheDocument();
  });

  it('shows a dedicated already-submitted state when the API rejects a repeat submission', async () => {
    const user = userEvent.setup();
    mockFetch({
      engagements: [activeEngagement()],
      profile: PROFILE,
      postHandler: () =>
        jsonResponse(
          {
            error: 'BadRequestError',
            message: 'An Outcome and Review submission already exists for this party',
          },
          400,
        ),
    });
    renderScreen('freelancer');

    await screen.findAllByText(/Harborview Media/);
    await user.selectOptions(screen.getByLabelText(/How did this engagement end/i), 'completed');
    await user.selectOptions(screen.getByLabelText(/Rating/i), '3');
    await user.click(screen.getByRole('button', { name: /Submit outcome/i }));

    expect(
      await screen.findByText(/You've already submitted an outcome and review/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit outcome/i })).not.toBeInTheDocument();
  });
});
