import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyProposals } from '../../lib/api/proposals.js';
import { listMyEngagements } from '../../lib/api/engagements.js';
import { getProfile } from '../../lib/api/profiles.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.jsx';

const budgetFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

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

export default function Work() {
  const [tab, setTab] = useState('proposals');
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [proposalsResult, engagementsResult] = await Promise.all([
        listMyProposals(),
        listMyEngagements(),
      ]);
      const names = await loadCounterpartyNames(engagementsResult.data);
      setState({
        status: 'ready',
        proposals: proposalsResult.data,
        engagements: engagementsResult.data,
        names,
      });
    } catch (err) {
      setState({ status: 'error', error: err.message || 'Failed to load your work' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="mt-6">
        <Spinner label="Loading your work" />
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
      <h1 className="text-xl font-semibold tracking-tight text-foreground">My work</h1>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="proposals">Proposals ({state.proposals.length})</TabsTrigger>
          <TabsTrigger value="engagements">Engagements ({state.engagements.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'proposals' &&
        (state.proposals.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No Proposals yet" description="Proposals you submit appear here." />
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card">
            {state.proposals.map((proposal) => (
              <li key={proposal.id}>
                <Link
                  to={`/jobs/${proposal.jobPost.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-background"
                >
                  <div>
                    <p className="font-medium text-foreground">{proposal.jobPost.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {budgetFormatter.format(proposal.bid)} · {proposal.payModel}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {proposal.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'engagements' &&
        (state.engagements.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No Engagements yet"
              description="Engagements appear here once a Proposal is accepted."
            />
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card">
            {state.engagements.map((engagement) => (
              <li key={engagement.id}>
                <Link
                  to={`/engagements/${engagement.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-background"
                >
                  <span className="font-medium text-foreground">
                    {state.names[engagement.counterpartyProfileId] || 'Unknown counterparty'}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {engagement.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
