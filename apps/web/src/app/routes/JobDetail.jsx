import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getJobPostById, requestRiskPreview } from '../../lib/api/jobPosts.js';
import { getProfile, listProfileReviews } from '../../lib/api/profiles.js';
import { getTrustScore } from '../../lib/api/trustScores.js';
import { createProposal } from '../../lib/api/proposals.js';
import { useSession } from '../session/SessionContext.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Textarea } from '../../components/ui/textarea.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.jsx';
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

const RISK_LEVEL_STYLE = {
  low: 'bg-band-high-soft text-band-high',
  med: 'bg-band-med-soft text-band-med',
  high: 'bg-destructive-soft text-destructive',
};

// Pre-Proposal preview, per Gate 3: a separate use case from the post-Proposal Client
// assessment. It scores the JobPost's own listed terms — a real Proposal has not been
// submitted yet, so this can only ever be "if you proposed around these terms," not a
// prediction of the freelancer's actual bid.
function RiskPreview({ jobPostId }) {
  const [state, setState] = useState({ status: 'idle' });

  async function runPreview(recompute) {
    setState({ status: 'loading' });
    try {
      const { data } = await requestRiskPreview(jobPostId, { recompute });
      const { engagement, riskAssessment } = data;
      setState({ status: 'ready', engagement, riskAssessment });
    } catch (err) {
      setState({ status: 'error', error: err.message || 'Could not generate a risk preview' });
    }
  }

  if (state.status === 'idle') {
    return (
      <Button type="button" variant="ghost" onClick={() => runPreview(false)}>
        Preview risk before proposing
      </Button>
    );
  }

  if (state.status === 'loading') {
    return <Spinner label="Generating risk preview" />;
  }

  if (state.status === 'error') {
    return <ErrorNotice message={state.error} onRetry={() => runPreview(false)} />;
  }

  const { riskAssessment } = state;
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold text-foreground">{riskAssessment.score}</span>
        <Badge className={`px-3 py-1 text-sm ${RISK_LEVEL_STYLE[riskAssessment.level]}`}>
          {riskAssessment.verdict}
        </Badge>
        <span className="text-xs text-muted-foreground">
          confidence {Math.round(riskAssessment.confidence * 100)}%
        </span>
        {riskAssessment.status === 'stale' && (
          <span className="text-xs font-medium text-destructive">stale — terms changed</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{riskAssessment.explanation}</p>
      {riskAssessment.signals.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {riskAssessment.signals.map((signal) => (
            <li key={signal.code} className="text-foreground">
              <span
                className={signal.severity === 'positive' ? 'text-band-high' : 'text-destructive'}
              >
                {signal.severity === 'positive' ? '+' : '−'}
              </span>{' '}
              {signal.label}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        This supports your decision to propose; it does not decide for you.
      </p>
      {riskAssessment.status === 'stale' && (
        <Button type="button" variant="ghost" className="mt-2" onClick={() => runPreview(true)}>
          Recompute
        </Button>
      )}
    </div>
  );
}

RiskPreview.propTypes = {
  jobPostId: PropTypes.string.isRequired,
};

function ProposalForm({ jobPostId, screeningQuestions }) {
  const [form, setForm] = useState({
    bid: '',
    payModel: 'project',
    proposedDurationDays: '',
    coverLetter: '',
  });
  const [milestones, setMilestones] = useState([{ description: '', amount: '' }]);
  const [screeningAnswers, setScreeningAnswers] = useState(screeningQuestions.map(() => ''));
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState(null);

  function setMilestone(index, field, value) {
    setMilestones((prev) =>
      prev.map((milestone, i) => (i === index ? { ...milestone, [field]: value } : milestone)),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      const answeredQuestions = screeningAnswers.filter((answer) => answer.trim() !== '');
      const filledMilestones = milestones.filter(
        (milestone) => milestone.description.trim() !== '' && milestone.amount !== '',
      );
      await createProposal({
        jobPostId,
        bid: Number(form.bid),
        payModel: form.payModel,
        proposedDurationDays: Number(form.proposedDurationDays),
        ...(form.coverLetter ? { coverLetter: form.coverLetter } : {}),
        ...(answeredQuestions.length > 0 ? { screeningAnswers: answeredQuestions } : {}),
        ...(form.payModel === 'milestone' && filledMilestones.length > 0
          ? {
              proposedMilestones: filledMilestones.map((m) => ({
                description: m.description,
                amount: Number(m.amount),
              })),
            }
          : {}),
      });
      setStatus('success');
      toast.success('Proposal submitted.');
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
      <div className="space-y-1.5">
        <Label htmlFor="bid">Your bid (USD)</Label>
        <Input
          id="bid"
          type="number"
          min="1"
          required
          value={form.bid}
          onChange={(event) => setForm({ ...form, bid: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payModel">Pay model</Label>
        <Select
          value={form.payModel}
          onValueChange={(value) => setForm({ ...form, payModel: value })}
        >
          <SelectTrigger id="payModel" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="milestone">Milestone</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.payModel === 'milestone' && (
        <div className="space-y-2">
          <span className="block text-sm font-medium text-foreground">Milestones</span>
          {milestones.map((milestone, index) => (
            <div key={index} className="flex gap-2">
              <Input
                type="text"
                placeholder="Description"
                value={milestone.description}
                onChange={(event) => setMilestone(index, 'description', event.target.value)}
                className="w-2/3"
              />
              <Input
                type="number"
                min="1"
                placeholder="Amount"
                value={milestone.amount}
                onChange={(event) => setMilestone(index, 'amount', event.target.value)}
                className="w-1/3"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMilestones((prev) => [...prev, { description: '', amount: '' }])}
          >
            Add milestone
          </Button>
        </div>
      )}
      {screeningQuestions.length > 0 && (
        <div className="space-y-3">
          <span className="block text-sm font-medium text-foreground">Screening questions</span>
          {screeningQuestions.map((question, index) => (
            <div key={question} className="space-y-1.5">
              <Label htmlFor={`screening-${index}`} className="font-normal text-muted-foreground">
                {question}
              </Label>
              <Textarea
                id={`screening-${index}`}
                value={screeningAnswers[index]}
                onChange={(event) =>
                  setScreeningAnswers((prev) =>
                    prev.map((answer, i) => (i === index ? event.target.value : answer)),
                  )
                }
                rows={2}
              />
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="proposedDurationDays">Estimated duration (days)</Label>
        <Input
          id="proposedDurationDays"
          type="number"
          min="1"
          step="1"
          required
          value={form.proposedDurationDays}
          onChange={(event) => setForm({ ...form, proposedDurationDays: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coverLetter">Cover letter (optional)</Label>
        <Textarea
          id="coverLetter"
          value={form.coverLetter}
          onChange={(event) => setForm({ ...form, coverLetter: event.target.value })}
          rows={4}
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
  screeningQuestions: PropTypes.arrayOf(PropTypes.string),
};

ProposalForm.defaultProps = {
  screeningQuestions: [],
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

      <div className="mt-6 space-y-8">
        <section className="rounded-md border border-border bg-card p-6">
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
            <div className="mt-4 flex flex-wrap gap-1.5">
              {job.skills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section>
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
                  <dd className="text-foreground">
                    {budgetFormatter.format(client.typicalBudget)}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section>
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

        <section className="rounded-md border-2 border-foreground bg-card p-6">
          <h2 className="text-lg font-medium text-foreground">Client trust score</h2>
          {trustScoreError && <ErrorNotice message={trustScoreError} onRetry={load} />}
          {!trustScoreError && trustScore && hasScore && (
            <>
              <div className="mt-3 flex items-center gap-4">
                <span className="text-3xl font-semibold text-foreground">
                  {Math.round(trustScore.score)}
                </span>
                <Badge className={`px-3 py-1 text-sm ${BAND_STYLE[trustScore.band]}`}>
                  {BAND_LABEL[trustScore.band]}
                </Badge>
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

        <section className="rounded-md border border-border bg-card p-6">
          <h2 className="text-lg font-medium text-foreground">Submit a proposal</h2>
          {canPropose ? (
            <div className="mt-3 space-y-4">
              <RiskPreview jobPostId={job.id} />
              <ProposalForm jobPostId={job.id} screeningQuestions={job.screeningQuestions} />
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
    </div>
  );
}
