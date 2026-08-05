import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useParams } from 'react-router-dom';
import { getJobPostById } from '../../lib/api/jobPosts.js';
import { getProfile, listProfileReviews } from '../../lib/api/profiles.js';
import { getTrustScore } from '../../lib/api/trustScores.js';
import { createProposal } from '../../lib/api/proposals.js';
import { useSession } from '../session/SessionContext.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Button from '../../components/ui/Button.jsx';
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

const budgetFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

function budgetLabel(post) {
  const amount = budgetFormatter.format(post.budgetOrRate);
  return post.jobType === 'hourly' ? `${amount}/hr` : amount;
}

function ProposalForm({ jobPostId }) {
  const [form, setForm] = useState({
    bid: '',
    payModel: 'project',
    proposedDurationDays: '',
    coverLetter: '',
  });
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      await createProposal({
        jobPostId,
        bid: Number(form.bid),
        payModel: form.payModel,
        proposedDurationDays: Number(form.proposedDurationDays),
        ...(form.coverLetter ? { coverLetter: form.coverLetter } : {}),
      });
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Failed to submit proposal');
    }
  }

  if (status === 'success') {
    return <p className="text-sm font-medium text-band-high">Proposal submitted.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="bid" className="block text-sm font-medium text-foreground">
          Your bid (USD)
        </label>
        <input
          id="bid"
          type="number"
          min="1"
          required
          value={form.bid}
          onChange={(event) => setForm({ ...form, bid: event.target.value })}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="payModel" className="block text-sm font-medium text-foreground">
          Pay model
        </label>
        <select
          id="payModel"
          value={form.payModel}
          onChange={(event) => setForm({ ...form, payModel: event.target.value })}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        >
          <option value="project">Project</option>
          <option value="milestone">Milestone</option>
        </select>
      </div>
      <div>
        <label htmlFor="proposedDurationDays" className="block text-sm font-medium text-foreground">
          Estimated duration (days)
        </label>
        <input
          id="proposedDurationDays"
          type="number"
          min="1"
          step="1"
          required
          value={form.proposedDurationDays}
          onChange={(event) => setForm({ ...form, proposedDurationDays: event.target.value })}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="coverLetter" className="block text-sm font-medium text-foreground">
          Cover letter (optional)
        </label>
        <textarea
          id="coverLetter"
          value={form.coverLetter}
          onChange={(event) => setForm({ ...form, coverLetter: event.target.value })}
          rows={4}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>
      {status === 'error' && <ErrorNotice message={error} />}
      <Button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Submitting…' : 'Submit proposal'}
      </Button>
    </form>
  );
}

ProposalForm.propTypes = {
  jobPostId: PropTypes.string.isRequired,
};

export default function JobDetail() {
  const { id } = useParams();
  const { identity } = useSession();

  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const job = await getJobPostById(id);

      let client = null;
      let clientError = null;
      try {
        client = await getProfile(job.clientProfileId);
      } catch (err) {
        clientError = err.message || 'Failed to load client information';
      }

      let trustScore = null;
      let trustScoreError = null;
      try {
        trustScore = await getTrustScore(job.clientProfileId);
      } catch (err) {
        trustScoreError = err.message || 'Trust score unavailable';
      }

      let reviews = { data: [] };
      let reviewsError = null;
      try {
        reviews = await listProfileReviews(job.clientProfileId);
      } catch (err) {
        reviewsError = err.message || 'Failed to load reviews';
      }

      setState({
        status: 'ready',
        job,
        client,
        clientError,
        trustScore,
        trustScoreError,
        reviews: reviews.data,
        reviewsError,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ status: 'not-found' });
        return;
      }
      setState({ status: 'error', error: err.message || 'Failed to load job post' });
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="mt-6">
        <Spinner label="Loading job post" />
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
        <EmptyState title="Job post not found" description="It may have been removed." />
      </div>
    );
  }

  const { job, client, clientError, trustScore, trustScoreError, reviews, reviewsError } = state;
  const hasScore = trustScore && (trustScore.status === 'scored' || trustScore.status === 'stale');
  const canPropose = identity?.activeProfile?.role === 'freelancer' && job.status === 'open';

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{job.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {job.category}
        {job.createdAt && ` · Posted ${dateFormatter.format(new Date(job.createdAt))}`}
        {` · ${job.proposalCount ?? 0} proposal${job.proposalCount === 1 ? '' : 's'}`}
      </p>

      <section className="mt-6 rounded-md border border-border bg-card p-6">
        <p className="text-sm whitespace-pre-wrap text-foreground">{job.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="text-foreground">{job.jobType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Budget/rate</dt>
            <dd className="text-foreground">{budgetLabel(job)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Experience level</dt>
            <dd className="text-foreground">{job.experienceLevel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project length</dt>
            <dd className="text-foreground">{job.projectLength}</dd>
          </div>
        </dl>
        {job.skills.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {job.skills.map((skill) => (
              <li
                key={skill}
                className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground"
              >
                {skill}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Posted by</h2>
        {clientError && (
          <div className="mt-2">
            <ErrorNotice message={clientError} onRetry={load} />
          </div>
        )}
        {!clientError && client && (
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border bg-card p-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Client</dt>
              <dd className="text-foreground">{client.displayName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verification</dt>
              <dd className="text-foreground">
                {client.verificationStatus === 'id-verified' ? 'ID verified' : 'Not verified'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="text-foreground">
                {client.createdAt ? dateFormatter.format(new Date(client.createdAt)) : 'Unknown'}
              </dd>
            </div>
            {client.industry && (
              <div>
                <dt className="text-muted-foreground">Industry</dt>
                <dd className="text-foreground">{client.industry}</dd>
              </div>
            )}
            {client.typicalBudget != null && (
              <div>
                <dt className="text-muted-foreground">Typical budget</dt>
                <dd className="text-foreground">{budgetFormatter.format(client.typicalBudget)}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="mt-8 rounded-md border-2 border-foreground bg-card p-6">
        <h2 className="text-lg font-medium text-foreground">Client trust score</h2>
        {trustScoreError && <ErrorNotice message={trustScoreError} onRetry={load} />}
        {!trustScoreError && trustScore && hasScore && (
          <>
            <div className="mt-3 flex items-center gap-4">
              <span className="text-3xl font-semibold text-foreground">
                {Math.round(trustScore.score)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${BAND_STYLE[trustScore.band]}`}
              >
                {BAND_LABEL[trustScore.band]}
              </span>
            </div>
            {(trustScore.signals ?? []).length > 0 && (
              <ul className="mt-4 space-y-2">
                {trustScore.signals.map((signal) => (
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
            <Link
              to={`/trust/${job.clientProfileId}`}
              className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-2"
            >
              View full trust score detail
            </Link>
          </>
        )}
        {!trustScoreError && trustScore && !hasScore && (
          <p className="mt-3 text-sm text-muted-foreground">No score yet.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Client reviews</h2>
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
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-foreground">Submit a proposal</h2>
        {canPropose ? (
          <div className="mt-3 max-w-md">
            <ProposalForm jobPostId={job.id} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {job.status !== 'open'
              ? 'This job post is not accepting proposals.'
              : 'Only freelancers can submit proposals.'}
          </p>
        )}
      </section>
    </div>
  );
}
