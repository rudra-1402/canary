import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEngagement } from '../../lib/api/engagements.js';
import { useSession } from '../session/SessionContext.jsx';
import { ApiError } from '../../lib/apiClient.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import TrustBadge from '../../components/ui/TrustBadge.jsx';
import { Badge } from '../../components/ui/badge.jsx';

const budgetFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

const RISK_LEVEL_STYLE = {
  low: 'bg-band-high-soft text-band-high',
  med: 'bg-band-med-soft text-band-med',
  high: 'bg-destructive-soft text-destructive',
};

const TIMELINE_LABEL = {
  'prospective-created': 'Prospective Engagement created',
  accepted: 'Proposal accepted — Engagement active',
  concluded: 'Both sides recorded an outcome — Engagement concluded',
};

export default function EngagementDetail() {
  const { id } = useParams();
  const { identity } = useSession();

  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { data } = await getEngagement(id);
      setState({ status: 'ready', engagement: data.engagement });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        setState({ status: 'not-found' });
        return;
      }
      setState({ status: 'error', error: err.message || 'Failed to load Engagement' });
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="mt-6">
        <Spinner label="Loading engagement" />
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <div className="mt-6">
        <EmptyState
          title="Engagement not found"
          description="It may not exist, or you may not be a party to it."
        />
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

  const { engagement } = state;
  const myRole = identity?.activeProfile?.role;
  const terms = engagement.agreedTerms ?? engagement.proposedTerms;
  const isProspective = engagement.status === 'prospective';
  const canRecordOutcome =
    engagement.allowedActions.includes('submit-outcome-review') && engagement.outcomeEligibility;

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {engagement.jobPost.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Status: {engagement.status}
        {isProspective && ' — terms shown are proposed, not yet agreed'}
      </p>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Freelancer</p>
          <p className="mt-1 font-medium text-foreground">
            {engagement.parties.freelancer.displayName}
          </p>
          <div className="mt-2">
            <TrustBadge entry={engagement.trustByParty.freelancer} />
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Client</p>
          <p className="mt-1 font-medium text-foreground">
            {engagement.parties.client.displayName}
          </p>
          <div className="mt-2">
            <TrustBadge entry={engagement.trustByParty.client} />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-foreground">
          {isProspective ? 'Proposed terms' : 'Agreed terms'}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="text-foreground">{budgetFormatter.format(terms.price)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Payment terms</dt>
            <dd className="text-foreground">{terms.paymentTerms}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Timeline</dt>
            <dd className="text-foreground">{terms.timeline}</dd>
          </div>
          {terms.dueAt && (
            <div>
              <dt className="text-muted-foreground">Due</dt>
              <dd className="text-foreground">{dateFormatter.format(new Date(terms.dueAt))}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-6 rounded-md border-2 border-foreground bg-card p-4">
        <h2 className="text-sm font-medium text-foreground">RiskAssessment</h2>
        {engagement.riskAssessment ? (
          <>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-2xl font-semibold text-foreground">
                {engagement.riskAssessment.score}
              </span>
              <Badge
                className={`px-3 py-1 text-sm ${RISK_LEVEL_STYLE[engagement.riskAssessment.level]}`}
              >
                {engagement.riskAssessment.verdict}
              </Badge>
              {engagement.riskAssessment.status === 'stale' && (
                <span className="text-xs font-medium text-destructive">stale</span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {engagement.riskAssessment.explanation}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              This supports the decision to accept — it does not decide automatically.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No RiskAssessment generated yet.</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-foreground">Timeline</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {engagement.timeline.map((event) => (
            <li key={event.event} className="text-muted-foreground">
              {TIMELINE_LABEL[event.event] ?? event.event} —{' '}
              {dateFormatter.format(new Date(event.at))}
            </li>
          ))}
        </ul>
      </section>

      {canRecordOutcome && (
        <div className="mt-6">
          <Link
            to={`/engagements/${engagement.id}/review`}
            className="inline-flex items-center rounded-md border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-card hover:bg-secondary-foreground"
          >
            Record outcome{myRole ? ` as ${myRole}` : ''}
          </Link>
        </div>
      )}
    </div>
  );
}
