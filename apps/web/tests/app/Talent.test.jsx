import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Talent from '../../src/app/routes/Talent.jsx';
import * as SessionContext from '../../src/app/session/SessionContext.jsx';

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  });
}

function renderTalent() {
  return render(
    <MemoryRouter>
      <Talent />
    </MemoryRouter>,
  );
}

describe('Talent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists discoverable Freelancers with their trust band for a Client viewer', async () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'client-1', role: 'client' } },
    });
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const href = url.toString();
      if (href.includes('/profiles?')) {
        return jsonResponse({
          data: [
            {
              id: 'f1',
              role: 'freelancer',
              displayName: 'Mina',
              headline: 'Product designer',
              paymentVerified: false,
              verificationStatus: 'none',
              skills: ['Figma'],
              hourlyRate: 55,
              portfolio: [],
              workHistory: [],
              certifications: [],
              languages: [],
              availableForWork: true,
              activeEngagementCount: 0,
              trust: { status: 'scored', profileId: 'f1', band: 'BAND_HIGH', score: 82 },
            },
          ],
          pagination: { page: 1, pageSize: 24, total: 1 },
        });
      }
      throw new Error(`Unhandled fetch: ${href}`);
    });

    renderTalent();

    expect(await screen.findByText('Mina')).toBeInTheDocument();
    expect(screen.getByText('Product designer')).toBeInTheDocument();
    expect(screen.getByText(/High trust/)).toBeInTheDocument();
  });

  it('gates the route for a non-Client viewer', () => {
    vi.spyOn(SessionContext, 'useSession').mockReturnValue({
      identity: { activeProfile: { id: 'f1', role: 'freelancer' } },
    });

    renderTalent();

    expect(screen.getByText('Client Profile required')).toBeInTheDocument();
  });
});
