import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { listTalent } from '../../lib/api/profiles.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import TrustBadge from '../../components/ui/TrustBadge.jsx';

const rateFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export default function Talent() {
  const { identity } = useSession();
  const [query, setQuery] = useState({ q: '', skills: '', sort: 'relevance' });
  const [state, setState] = useState({ status: 'loading', freelancers: [] });

  const load = useCallback(async () => {
    setState({ status: 'loading', freelancers: [] });
    try {
      const result = await listTalent({
        q: query.q || undefined,
        skills: query.skills || undefined,
        sort: query.sort,
        page: 1,
        pageSize: 24,
      });
      setState({ status: 'ready', freelancers: result.data });
    } catch (err) {
      setState({
        status: 'error',
        freelancers: [],
        error: err.message || 'Failed to load Freelancers',
      });
    }
  }, [query.q, query.skills, query.sort]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (identity?.activeProfile?.role !== 'client') {
    return (
      <EmptyState
        title="Client Profile required"
        description="Talent search is only available to Client Profiles."
      />
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Find talent</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Discoverable Freelancers who are currently available for work.
      </p>

      <form
        onSubmit={(event) => event.preventDefault()}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <div>
          <label htmlFor="q" className="block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <input
            id="q"
            type="text"
            value={query.q}
            onChange={(event) => setQuery({ ...query, q: event.target.value })}
            className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="skills" className="block text-xs font-medium text-muted-foreground">
            Skills (comma-separated)
          </label>
          <input
            id="skills"
            type="text"
            value={query.skills}
            onChange={(event) => setQuery({ ...query, skills: event.target.value })}
            className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="sort" className="block text-xs font-medium text-muted-foreground">
            Sort
          </label>
          <select
            id="sort"
            value={query.sort}
            onChange={(event) => setQuery({ ...query, sort: event.target.value })}
            className="mt-1 rounded-md border border-border px-3 py-1.5 text-sm"
          >
            <option value="relevance">Relevance</option>
            <option value="trust-desc">Trust (highest)</option>
            <option value="rate-asc">Rate (lowest)</option>
            <option value="rate-desc">Rate (highest)</option>
          </select>
        </div>
      </form>

      {state.status === 'loading' && (
        <div className="mt-6">
          <Spinner label="Loading Freelancers" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-6">
          <ErrorNotice message={state.error} onRetry={load} />
        </div>
      )}

      {state.status === 'ready' && state.freelancers.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No matching Freelancers"
            description="Try a broader search or different skills."
          />
        </div>
      )}

      {state.status === 'ready' && state.freelancers.length > 0 && (
        <ul className="mt-6 divide-y divide-border rounded-md border border-border bg-card">
          {state.freelancers.map((freelancer) => (
            <li key={freelancer.id}>
              <Link
                to={`/trust/${freelancer.id}`}
                className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-background"
              >
                <div>
                  <p className="font-medium text-foreground">{freelancer.displayName}</p>
                  {freelancer.headline && (
                    <p className="mt-1 text-sm text-muted-foreground">{freelancer.headline}</p>
                  )}
                  <p className="mt-1 text-sm text-muted-foreground">
                    {freelancer.hourlyRate != null &&
                      `${rateFormatter.format(freelancer.hourlyRate)}/hr`}
                    {freelancer.activeEngagementCount > 0 &&
                      ` · ${freelancer.activeEngagementCount} active engagement${freelancer.activeEngagementCount === 1 ? '' : 's'}`}
                  </p>
                  {freelancer.skills.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {freelancer.skills.map((skill) => (
                        <li
                          key={skill}
                          className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {skill}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <TrustBadge entry={freelancer.trust} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
