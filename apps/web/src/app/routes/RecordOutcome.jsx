import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useParams } from 'react-router-dom';
import { listMyEngagements } from '../../lib/api/engagements.js';
import { getProfile } from '../../lib/api/profiles.js';
import { submitOutcomeReview } from '../../lib/api/outcomeReviews.js';
import { useSession } from '../session/SessionContext.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Textarea } from '../../components/ui/textarea.jsx';
import { Checkbox } from '../../components/ui/checkbox.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select.jsx';

const budgetFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// Exact message the API throws when this party has already submitted —
// see outcomeReview.service.js createOutcomeReview. Matched by string
// because there is no GET to pre-check submission state before the fact.
const ALREADY_SUBMITTED_MESSAGE = 'An Outcome and Review submission already exists for this party';

const TRISTATE_OPTIONS = [
  { value: 'unknown', label: 'Not sure' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

// Honest causal sequence per Gate 5: recording an Outcome does not instantly change a
// TrustScore — it stales the current evidence and queues a rescore for the next scoring
// pass. No synchronous "rescore requested -> current" step exists in this API to report,
// so this states the true sequence rather than implying an instant, unshown change.
function CausalSequenceNote({ profileId }) {
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Outcome recorded → the affected TrustScore evidence is now stale → it recomputes in the next
      scoring pass, not instantly.
      {profileId && (
        <>
          {' '}
          <Link to={`/trust/${profileId}`} className="underline">
            View current TrustScore
          </Link>
          .
        </>
      )}
    </p>
  );
}

CausalSequenceNote.propTypes = {
  profileId: PropTypes.string,
};

CausalSequenceNote.defaultProps = {
  profileId: null,
};

function initialForm() {
  return {
    endedAs: 'completed',
    ghosted: false,
    daysLate: '',
    revisionsRequested: '',
    paidInFull: 'unknown',
    scopeCreepOccurred: 'unknown',
    rating: '5',
    reviewText: '',
  };
}

function buildPayload(engagementId, role, form) {
  const outcome = {
    endedAs: form.endedAs,
    ghosted: form.ghosted,
    observed: true,
  };

  if (!form.ghosted) {
    if (role === 'client') {
      if (form.daysLate !== '') outcome.daysLate = Number(form.daysLate);
    } else if (role === 'freelancer') {
      if (form.revisionsRequested !== '') {
        outcome.revisionsRequested = Number(form.revisionsRequested);
      }
      if (form.paidInFull !== 'unknown') outcome.paidInFull = form.paidInFull === 'yes';
      if (form.scopeCreepOccurred !== 'unknown') {
        outcome.scopeCreepOccurred = form.scopeCreepOccurred === 'yes';
      }
    }
  }

  const review = { rating: Number(form.rating) };
  if (form.reviewText.trim()) review.text = form.reviewText.trim();

  return { engagementId, outcome, review };
}

export default function RecordOutcome() {
  const { id } = useParams();
  const { identity } = useSession();
  const role = identity?.activeProfile?.role;

  const [state, setState] = useState({ status: 'loading' });
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await listMyEngagements();
      const engagement = result.data.find((e) => e.id === id);
      if (!engagement) {
        setState({ status: 'not-found' });
        return;
      }

      let counterpartyName = null;
      try {
        const profile = await getProfile(engagement.counterpartyProfileId);
        counterpartyName = profile.displayName;
      } catch {
        counterpartyName = null;
      }

      setState({ status: 'ready', engagement, counterpartyName });
    } catch (err) {
      setState({ status: 'error', error: err.message || 'Failed to load engagement' });
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildPayload(state.engagement.id, role, form);
      const result = await submitOutcomeReview(payload);
      setState((prev) => ({ ...prev, submitted: result }));
    } catch (err) {
      if (err.message === ALREADY_SUBMITTED_MESSAGE) {
        setState((prev) => ({ ...prev, alreadySubmitted: true }));
      } else {
        setSubmitError(err.message || 'Failed to submit outcome and review');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="mt-6">
        <Spinner label="Loading engagement" />
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
          title="Engagement not found"
          description="It may not exist, or you may not be a party to it."
        />
      </div>
    );
  }

  const { engagement, counterpartyName } = state;
  const counterparty = counterpartyName || 'Unknown counterparty';
  const terms = engagement.agreedTerms;

  const header = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Record outcome & review
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        With <span className="font-medium text-foreground">{counterparty}</span>
        {role && ` — you are recording this as the ${role} on this contract.`}
      </p>
      {terms && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border bg-card p-4 text-sm sm:grid-cols-3">
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
        </dl>
      )}
    </div>
  );

  if (engagement.status === 'concluded') {
    return (
      <div>
        {header}
        <div className="mt-8 rounded-md border-2 border-foreground bg-card p-6">
          <p className="text-sm font-medium text-foreground">
            Both sides have submitted. This engagement is concluded, and reviews are now visible.
          </p>
          <CausalSequenceNote profileId={engagement.counterpartyProfileId} />
        </div>
      </div>
    );
  }

  if (engagement.status !== 'active') {
    return (
      <div>
        {header}
        <div className="mt-8">
          <EmptyState
            title="Not yet active"
            description="Outcomes and reviews can only be recorded for an active engagement."
          />
        </div>
      </div>
    );
  }

  if (state.alreadySubmitted) {
    return (
      <div>
        {header}
        <div className="mt-8 rounded-md border border-border bg-card p-6">
          <p className="text-sm font-medium text-foreground">
            You&apos;ve already submitted an outcome and review for this engagement.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            It stays hidden — the double-blind rule — until {counterparty} submits theirs too. Once
            both sides are in, both reviews unlock at once.
          </p>
        </div>
      </div>
    );
  }

  if (state.submitted) {
    if (state.submitted.engagementStatus === 'concluded') {
      return (
        <div>
          {header}
          <div className="mt-8 rounded-md border-2 border-foreground bg-card p-6">
            <p className="text-sm font-medium text-foreground">
              Both sides have submitted. This engagement is concluded, and reviews are now visible.
            </p>
            <CausalSequenceNote profileId={engagement.counterpartyProfileId} />
          </div>
        </div>
      );
    }
    return (
      <div>
        {header}
        <div className="mt-8 rounded-md border border-border bg-card p-6">
          <p className="text-sm font-medium text-foreground">
            Your side is recorded. Waiting on {counterparty} to submit their outcome and review.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Double-blind: your review stays hidden until {counterparty} submits theirs too. Once
            both sides are in, both reviews unlock at once.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="mt-6 rounded-md border-2 border-foreground bg-card p-4 text-sm text-foreground">
        <p className="font-medium">Double-blind rule</p>
        <p className="mt-1 text-muted-foreground">
          Your review stays hidden until {counterparty} submits theirs too. Once both sides are in,
          both reviews unlock at once and this engagement concludes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="endedAs">How did this engagement end?</Label>
          <Select
            value={form.endedAs}
            onValueChange={(value) => setForm({ ...form, endedAs: value })}
          >
            <SelectTrigger id="endedAs" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="ghosted">Ghosted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Label htmlFor="ghosted" className="font-normal">
          <Checkbox
            id="ghosted"
            checked={form.ghosted}
            onCheckedChange={(checked) => setForm({ ...form, ghosted: checked === true })}
          />
          The other party stopped responding (ghosted)
        </Label>

        {!form.ghosted && role === 'client' && (
          <div className="space-y-1.5">
            <Label htmlFor="daysLate">
              Days late for the other party (leave blank if delivered on time)
            </Label>
            <Input
              id="daysLate"
              type="number"
              min="0"
              step="1"
              value={form.daysLate}
              onChange={(event) => setForm({ ...form, daysLate: event.target.value })}
            />
          </div>
        )}

        {!form.ghosted && role === 'freelancer' && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="paidInFull">Paid in full by the other party?</Label>
              <Select
                value={form.paidInFull}
                onValueChange={(value) => setForm({ ...form, paidInFull: value })}
              >
                <SelectTrigger id="paidInFull" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRISTATE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revisionsRequested">Revisions requested by the other party</Label>
              <Input
                id="revisionsRequested"
                type="number"
                min="0"
                step="1"
                value={form.revisionsRequested}
                onChange={(event) => setForm({ ...form, revisionsRequested: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scopeCreepOccurred">Scope creep caused by the other party?</Label>
              <Select
                value={form.scopeCreepOccurred}
                onValueChange={(value) => setForm({ ...form, scopeCreepOccurred: value })}
              >
                <SelectTrigger id="scopeCreepOccurred" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRISTATE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="rating">Rating</Label>
          <Select
            value={form.rating}
            onValueChange={(value) => setForm({ ...form, rating: value })}
          >
            <SelectTrigger id="rating" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 4, 3, 2, 1].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / 5
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reviewText">Review (optional)</Label>
          <Textarea
            id="reviewText"
            value={form.reviewText}
            onChange={(event) => setForm({ ...form, reviewText: event.target.value })}
            rows={4}
          />
        </div>

        {submitError && <ErrorNotice message={submitError} />}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit outcome & review'}
        </Button>
      </form>
    </div>
  );
}
