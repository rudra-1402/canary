import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { listTalent } from '../../lib/api/profiles.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import TrustBadge from '../../components/ui/TrustBadge.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.jsx';

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
        <div className="space-y-1.5">
          <Label htmlFor="q" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input
            id="q"
            type="text"
            value={query.q}
            onChange={(event) => setQuery({ ...query, q: event.target.value })}
            className="h-auto py-1.5"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="skills" className="text-xs text-muted-foreground">
            Skills (comma-separated)
          </Label>
          <Input
            id="skills"
            type="text"
            value={query.skills}
            onChange={(event) => setQuery({ ...query, skills: event.target.value })}
            className="h-auto py-1.5"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sort" className="text-xs text-muted-foreground">
            Sort
          </Label>
          <Select value={query.sort} onValueChange={(value) => setQuery({ ...query, sort: value })}>
            <SelectTrigger id="sort" className="h-auto py-1.5 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="trust-desc">Trust (highest)</SelectItem>
              <SelectItem value="rate-asc">Rate (lowest)</SelectItem>
              <SelectItem value="rate-desc">Rate (highest)</SelectItem>
            </SelectContent>
          </Select>
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
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {freelancer.skills.map((skill) => (
                        <Badge key={skill} variant="secondary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
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
