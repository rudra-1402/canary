import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSession } from '../session/SessionContext.jsx';
import { listMyJobPosts } from '../../lib/api/jobPosts.js';
import {
  acceptProposal,
  declineProposal,
  listJobPostProposals,
  requestProposalRiskAssessment,
} from '../../lib/api/proposals.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.jsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog.jsx';

const RISK_LEVEL_STYLE = {
  low: 'bg-band-high-soft text-band-high',
  med: 'bg-band-med-soft text-band-med',
  high: 'bg-destructive-soft text-destructive',
};

const DECLINE_REASONS = [
  { code: '', label: 'No reason (optional)' },
  { code: 'terms-not-aligned', label: 'Terms not aligned' },
  { code: 'selected-another-freelancer', label: 'Selected another Freelancer' },
  { code: 'scope-changed', label: 'Scope changed' },
];

function RiskCell({ proposal, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const risk = proposal.riskAssessment;

  async function generate(recompute) {
    setBusy(true);
    setError(null);
    try {
      const { data } = await requestProposalRiskAssessment(proposal.id, { recompute });
      onChange(data.riskAssessment);
      toast.success(recompute ? 'RiskAssessment recomputed.' : 'RiskAssessment generated.');
    } catch (err) {
      const message = err.message || 'Could not generate a RiskAssessment';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (!risk) {
    return (
      <div>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => generate(false)}>
          {busy ? 'Generating…' : 'Generate risk assessment'}
        </Button>
        {error && <ErrorNotice message={error} />}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-foreground">{risk.score}</span>
        <Badge className={RISK_LEVEL_STYLE[risk.level]}>{risk.verdict}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        confidence {Math.round(risk.confidence * 100)}%
        {risk.status === 'stale' && ' · stale — terms changed since this was generated'}
      </p>
      {risk.status === 'stale' && (
        <Button type="button" variant="ghost" disabled={busy} onClick={() => generate(true)}>
          {busy ? 'Recomputing…' : 'Recompute'}
        </Button>
      )}
      {error && <ErrorNotice message={error} />}
    </div>
  );
}

const riskAssessmentShape = PropTypes.shape({
  score: PropTypes.number,
  level: PropTypes.oneOf(['low', 'med', 'high']),
  verdict: PropTypes.string,
  confidence: PropTypes.number,
  status: PropTypes.oneOf(['current', 'stale']),
});

RiskCell.propTypes = {
  proposal: PropTypes.shape({
    id: PropTypes.string.isRequired,
    riskAssessment: riskAssessmentShape,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};

const proposalShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  bid: PropTypes.number.isRequired,
  payModel: PropTypes.string.isRequired,
  proposedDurationDays: PropTypes.number.isRequired,
  coverLetter: PropTypes.string,
  freelancer: PropTypes.shape({ displayName: PropTypes.string.isRequired }).isRequired,
  riskAssessment: riskAssessmentShape,
});

function ProposalRow({ proposal, onUpdated }) {
  const [current, setCurrent] = useState(proposal);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  const [reasonCode, setReasonCode] = useState('none');

  const canAccept = current.riskAssessment && current.riskAssessment.status === 'current';

  async function handleAccept() {
    setDecisionBusy(true);
    setDecisionError(null);
    try {
      await acceptProposal(current.id);
      toast.success(`Accepted ${current.freelancer.displayName}'s Proposal.`);
      onUpdated();
    } catch (err) {
      const message = err.message || 'Could not accept this Proposal';
      setDecisionError(message);
      toast.error(message);
    } finally {
      setDecisionBusy(false);
    }
  }

  async function handleDecline() {
    setDecisionBusy(true);
    setDecisionError(null);
    try {
      await declineProposal(current.id, reasonCode === 'none' ? undefined : reasonCode);
      toast.success(`Declined ${current.freelancer.displayName}'s Proposal.`);
      onUpdated();
    } catch (err) {
      const message = err.message || 'Could not decline this Proposal';
      setDecisionError(message);
      toast.error(message);
    } finally {
      setDecisionBusy(false);
    }
  }

  if (current.status !== 'submitted' && current.status !== 'shortlisted') {
    return (
      <li className="px-5 py-4 text-sm">
        <p className="font-medium text-foreground">{current.freelancer.displayName}</p>
        <p className="mt-1 text-muted-foreground">Status: {current.status}</p>
      </li>
    );
  }

  return (
    <li className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-3">
      <div>
        <p className="font-medium text-foreground">{current.freelancer.displayName}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Bid ${current.bid} · {current.payModel} · {current.proposedDurationDays} days
        </p>
        {current.coverLetter && (
          <p className="mt-1 text-sm text-muted-foreground">{current.coverLetter}</p>
        )}
      </div>

      <RiskCell
        proposal={current}
        onChange={(riskAssessment) => setCurrent({ ...current, riskAssessment })}
      />

      <div className="flex flex-col items-start gap-2">
        {!canAccept && (
          <p className="text-xs text-muted-foreground">
            {current.riskAssessment
              ? 'Recompute the RiskAssessment before accepting — it is stale.'
              : 'Generate a RiskAssessment before accepting.'}
          </p>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" disabled={!canAccept || decisionBusy}>
              {decisionBusy ? 'Accepting…' : 'Accept'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Accept this Proposal?</AlertDialogTitle>
              <AlertDialogDescription>
                {current.freelancer.displayName} bid ${current.bid} ({current.payModel},{' '}
                {current.proposedDurationDays} days). Accepting starts the Engagement and closes
                this JobPost to further acceptance. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleAccept}>Confirm accept</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <div className="flex items-center gap-2">
          <Select value={reasonCode} onValueChange={setReasonCode}>
            <SelectTrigger className="h-auto py-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DECLINE_REASONS.map((reason) => (
                <SelectItem key={reason.code} value={reason.code || 'none'}>
                  {reason.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" disabled={decisionBusy} onClick={handleDecline}>
            Decline
          </Button>
        </div>
        {decisionError && <ErrorNotice message={decisionError} />}
      </div>
    </li>
  );
}

ProposalRow.propTypes = {
  proposal: proposalShape.isRequired,
  onUpdated: PropTypes.func.isRequired,
};

function ProposalInbox({ jobPostId }) {
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await listJobPostProposals(jobPostId, { page: 1, pageSize: 50 });
      setState({ status: 'ready', proposals: result.data });
    } catch (err) {
      setState({ status: 'error', error: err.message || 'Failed to load Proposals' });
    }
  }, [jobPostId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === 'loading') return <Spinner label="Loading proposals" />;
  if (state.status === 'error') return <ErrorNotice message={state.error} onRetry={load} />;
  if (state.proposals.length === 0) {
    return (
      <EmptyState
        title="No Proposals yet"
        description="Proposals appear here as Freelancers submit them."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {state.proposals.map((proposal) => (
        <ProposalRow key={proposal.id} proposal={proposal} onUpdated={load} />
      ))}
    </ul>
  );
}

ProposalInbox.propTypes = {
  jobPostId: PropTypes.string.isRequired,
};

export default function JobPostsOwner() {
  const { identity } = useSession();
  const [state, setState] = useState({ status: 'loading', jobPosts: [] });
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setState({ status: 'loading', jobPosts: [] });
    try {
      const result = await listMyJobPosts({ page: 1, pageSize: 50 });
      setState({ status: 'ready', jobPosts: result.data });
      if (result.data.length > 0) setSelectedId((current) => current ?? result.data[0].id);
    } catch (err) {
      setState({
        status: 'error',
        jobPosts: [],
        error: err.message || 'Failed to load your JobPosts',
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (identity?.activeProfile?.role !== 'client') {
    return (
      <EmptyState
        title="Client Profile required"
        description="Managing JobPosts and Proposals is only available to Client Profiles."
      />
    );
  }

  if (state.status === 'loading') return <Spinner label="Loading your JobPosts" />;
  if (state.status === 'error') return <ErrorNotice message={state.error} onRetry={load} />;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Manage jobs &amp; proposals
        </h1>
        <Link
          to="/job-posts/new"
          className="text-sm font-medium text-primary underline underline-offset-2"
        >
          New JobPost
        </Link>
      </div>

      {state.jobPosts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No JobPosts yet"
            description="JobPosts you publish will appear here with their Proposal counts."
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ul className="divide-y divide-border rounded-md border border-border bg-card lg:col-span-1">
            {state.jobPosts.map((jobPost) => (
              <li key={jobPost.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(jobPost.id)}
                  className={`block w-full px-4 py-3 text-left text-sm hover:bg-background ${
                    selectedId === jobPost.id
                      ? 'bg-background font-medium text-foreground'
                      : 'text-foreground'
                  }`}
                >
                  <p>{jobPost.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {jobPost.status} · {jobPost.proposalCounts.submitted} pending ·{' '}
                    {jobPost.proposalCounts.total} total
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="lg:col-span-2">
            {selectedId ? (
              <ProposalInbox jobPostId={selectedId} />
            ) : (
              <EmptyState
                title="Select a JobPost"
                description="Pick one from the list to see its Proposals."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
