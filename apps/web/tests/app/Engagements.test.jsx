import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Engagements from '../../src/app/routes/Engagements.jsx';
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

const ACTIVE_ID = '6a6e4df05a26359d9f11e5a1';
const CONCLUDED_ID = '6a6e4df05a26359d9f11e5a2';
const PROSPECTIVE_ID = '6a6e4df05a26359d9f11e5a3';
const COUNTERPARTY_ID = '6a6e4df05a26359d9f0f2cf4';

const AGREED_TERMS = {
  scope: 'Rebuild the onboarding flow',
  price: 3200,
  paymentTerms: 'net-15',
  timeline: '3 weeks',
  revisionsIncluded: 2,
};

function renderEngagements() {
  return render(
    <MemoryRouter initialEntries={['/engagements']}>
      <Routes>
        <Route path="/engagements" element={<Engagements />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Engagements', () => {
  beforeEach(() => {
    resetCsrfToken();
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'viewer-profile-id', role: 'freelancer' } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state before the engagements arrive', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    renderEngagements();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with retry when the list request fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/me/engagements')) {
        return jsonResponse({ error: 'InternalServerError' }, 500);
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });
    renderEngagements();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('shows an empty state when there are no active engagements', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/me/engagements')) {
        return jsonResponse({
          data: [
            {
              id: CONCLUDED_ID,
              counterpartyProfileId: COUNTERPARTY_ID,
              jobPostId: null,
              proposalId: null,
              status: 'concluded',
              agreedTerms: AGREED_TERMS,
              createdAt: '2026-07-01T00:00:00.000Z',
            },
            {
              id: PROSPECTIVE_ID,
              counterpartyProfileId: COUNTERPARTY_ID,
              jobPostId: null,
              proposalId: null,
              status: 'prospective',
              agreedTerms: null,
              createdAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });
    renderEngagements();
    expect(await screen.findByText('No active engagements')).toBeInTheDocument();
  });

  it('lists active engagements with the counterparty name and links to the review screen', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/me/engagements')) {
        return jsonResponse({
          data: [
            {
              id: ACTIVE_ID,
              counterpartyProfileId: COUNTERPARTY_ID,
              jobPostId: null,
              proposalId: null,
              status: 'active',
              agreedTerms: AGREED_TERMS,
              createdAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (href.includes(`/profiles/${COUNTERPARTY_ID}`)) {
        return jsonResponse({ id: COUNTERPARTY_ID, displayName: 'Harborview Media' });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });
    renderEngagements();

    expect(await screen.findByText('Harborview Media')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Harborview Media/ })).toHaveAttribute(
      'href',
      `/engagements/${ACTIVE_ID}/review`,
    );
  });
});
