import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyEngagements } from '../../lib/api/engagements.js';
import { getProfile } from '../../lib/api/profiles.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

const budgetFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// Best-effort name lookup per unique counterparty. /me/engagements only carries
// counterpartyProfileId — if a lookup fails the row still renders, just with
// "Unknown counterparty" rather than blocking the whole list.
async function loadCounterpartyNames(engagements) {
  const ids = [...new Set(engagements.map((e) => e.counterpartyProfileId))];
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const profile = await getProfile(id);
        return [id, profile.displayName];
      } catch {
        return [id, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}

export default function Engagements() {
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await listMyEngagements();
      const active = result.data.filter((e) => e.status === 'active');
      const names = await loadCounterpartyNames(active);
      setState({ status: 'ready', engagements: active, names });
    } catch (err) {
      setState({ status: 'error', error: err.message || 'Failed to load engagements' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="mt-6">
        <Spinner label="Loading engagements" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mt-6">
        <ErrorNotice message={state.error} onRetry={load} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Active engagements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Record an outcome and review once the work is done — reviews stay hidden until both sides
        have submitted.
      </p>

      {state.engagements.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No active engagements"
            description="Engagements you can record an outcome for appear here once a contract is active."
          />
        </div>
      )}

      {state.engagements.length > 0 && (
        <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card">
          {state.engagements.map((engagement) => {
            const counterpartyName =
              state.names[engagement.counterpartyProfileId] || 'Unknown counterparty';
            return (
              <li key={engagement.id}>
                <Link
                  to={`/engagements/${engagement.id}/review`}
                  className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-background"
                >
                  <div>
                    <p className="font-medium text-foreground">{counterpartyName}</p>
                    {engagement.agreedTerms && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {engagement.agreedTerms.scope} ·{' '}
                        {budgetFormatter.format(engagement.agreedTerms.price)} ·{' '}
                        {engagement.agreedTerms.timeline}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-medium text-primary">Record outcome</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
