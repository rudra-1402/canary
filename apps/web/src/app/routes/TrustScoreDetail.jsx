import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getProfile, listProfileReviews } from '../../lib/api/profiles.js';
import { getTrustScore, listTrustScoreOutcomes } from '../../lib/api/trustScores.js';
import { useSession } from '../session/SessionContext.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { ApiError } from '../../lib/apiClient.js';

const BAND_LABEL = { BAND_HIGH: 'High trust', BAND_MED: 'Med trust', BAND_LOW: 'Low trust' };
const BAND_STYLE = {
  BAND_HIGH: 'bg-band-high-soft text-band-high',
  BAND_MED: 'bg-band-med-soft text-band-med',
  BAND_LOW: 'bg-destructive-soft text-destructive',
};
const STRENGTH_LABEL = {
  STRENGTH_STRONG: 'Strong',
  STRENGTH_MEDIUM: 'Medium',
  STRENGTH_WEAK: 'Weak',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

function formatDate(iso) {
  return iso ? dateFormatter.format(new Date(iso)) : null;
}

function outcomeSummary(outcome) {
  const parts = [outcome.subjectRole === 'freelancer' ? 'As freelancer' : 'As client'];
  if (outcome.ghosted) {
    parts.push('ghosted');
  } else {
    parts.push(outcome.endedAs);
    if (outcome.daysLate != null) parts.push(`${outcome.daysLate} day(s) late`);
    if (outcome.paidInFull != null)
      parts.push(outcome.paidInFull ? 'paid in full' : 'not paid in full');
    if (outcome.scopeCreepOccurred != null && outcome.scopeCreepOccurred) parts.push('scope creep');
  }
  return parts.join(' · ');
}

export default function TrustScoreDetail() {
  const { profileId } = useParams();
  const { identity } = useSession();
  const isOwnProfile = identity?.activeProfile?.id === profileId;

  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [profile, trustScore] = await Promise.all([
        getProfile(profileId),
        getTrustScore(profileId),
      ]);

      let outcomes = { data: [] };
      let outcomesError = null;
      try {
        outcomes = await listTrustScoreOutcomes(profileId);
      } catch (err) {
        outcomesError = err.message || 'Failed to load outcome evidence';
      }

      let reviews = { data: [] };
      let reviewsError = null;
      try {
        reviews = await listProfileReviews(profileId);
      } catch (err) {
        reviewsError = err.message || 'Failed to load reviews';
      }

      setState({
        status: 'ready',
        profile,
        trustScore,
        outcomes: outcomes.data,
        outcomesError,
        reviews: reviews.data,
        reviewsError,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: 'not-found' });
        return;
      }
      setState({ status: 'error', error: err.message || 'Failed to load trust score' });
    }
  }, [profileId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="mt-6">
        <Spinner label="Loading trust score" />
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

  if (state.status === 'not-found') {
    return (
      <div className="mt-6">
        <EmptyState
          title="Trust score not found"
          description="This profile does not exist or is not visible to you."
        />
      </div>
    );
  }

  const { profile, trustScore, outcomes, outcomesError, reviews, reviewsError } = state;
  const hasScore = trustScore.status === 'scored' || trustScore.status === 'stale';
  const signals = trustScore.signals ?? [];
  const unfavorableSignals = signals.filter((s) => s.direction === 'unfavorable');

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Trust score · {profile.displayName}
      </h1>

      <section className="mt-6 rounded-md border border-border bg-card p-6">
        {hasScore ? (
          <div className="flex items-center gap-4">
            <span className="text-3xl font-semibold text-foreground">
              {Math.round(trustScore.score)}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${BAND_STYLE[trustScore.band]}`}
            >
              {BAND_LABEL[trustScore.band]}
            </span>
            {trustScore.status === 'stale' && (
              <span className="text-xs text-muted-foreground">
                {trustScore.outcomesSince} outcome(s) since this snapshot
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {trustScore.status === 'insufficient-history'
              ? `No score yet — ${trustScore.outcomeCount} of ${trustScore.outcomesNeeded} outcomes needed.`
              : 'No score yet — scoring is pending.'}
          </p>
        )}

        {signals.length > 0 && (
          <ul className="mt-5 space-y-2">
            {signals.map((signal) => (
              <li
                key={signal.name}
                className="flex items-center justify-between gap-4 border-t border-border pt-2 text-sm first:border-t-0 first:pt-0"
              >
                <span className="text-foreground">{signal.name}</span>
                <span
                  className={
                    signal.direction === 'favorable' ? 'text-band-high' : 'text-destructive'
                  }
                >
                  {signal.direction === 'favorable' ? 'Favorable' : 'Unfavorable'} ·{' '}
                  {STRENGTH_LABEL[signal.strength]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwnProfile && unfavorableSignals.length > 0 && (
        <section className="mt-6 rounded-md border border-border bg-background p-4">
          <h2 className="text-sm font-medium text-foreground">How to improve</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These signals are currently working against your score:{' '}
            {unfavorableSignals.map((s) => s.name).join(', ')}.
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Outcome history</h2>
        {outcomesError && (
          <div className="mt-2">
            <ErrorNotice message={outcomesError} onRetry={load} />
          </div>
        )}
        {!outcomesError && outcomes.length === 0 && (
          <div className="mt-2">
            <EmptyState title="No outcome history yet" />
          </div>
        )}
        {!outcomesError && outcomes.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
            {outcomes.map((outcome) => (
              <li key={outcome.id} className="px-4 py-3 text-sm text-foreground">
                {outcomeSummary(outcome)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDate(outcome.recordedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Reviews</h2>
        {reviewsError && (
          <div className="mt-2">
            <ErrorNotice message={reviewsError} onRetry={load} />
          </div>
        )}
        {!reviewsError && reviews.length === 0 && (
          <div className="mt-2">
            <EmptyState title="No reviews yet" />
          </div>
        )}
        {!reviewsError && reviews.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-card">
            {reviews.map((review) => (
              <li key={review.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-foreground">{review.rating} / 5</p>
                {review.text && <p className="mt-1 text-muted-foreground">{review.text}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(review.visibleAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
