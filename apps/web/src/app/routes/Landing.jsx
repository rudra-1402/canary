import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import RegistrationPlates from '../../components/landing/RegistrationPlates.jsx';
import RegistrationPressButton from '../../components/landing/RegistrationPressButton.jsx';

const DIRECTION_CONTRACT = `
THESIS: Two independent records only ever align into one visible result once
real evidence backs them — Canary is the act of registration, not a badge.
OWN-WORLD: Chromatic Proof — Cobalt/Vermilion/Canary plates on an Ink field,
Martian Grotesk display, Martian Mono for evidence and figures; rounded-rect
fields, pill CTAs, circular registration points, proof-sheet corner marks.
STORY: A Freelancer or Client learns both sides get scored from real
Engagement outcomes, watches the registration mechanism prove that live, and
starts an account.
FIRST VIEWPORT: Full-bleed Ink field. Headline and CTA left, three plates
(Cobalt rect / Vermilion rect / Canary circle) drift apart at rest and pull
into register as the cursor nears center, right ~46% of viewport. Corner
registration marks frame the composition.
FORM: candidate 5 of 7 (dual-ledger / proof-print structure: the page as two
interleaved registration sheets), seed key 98899076.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, and DESIGN.md.
`;

function CornerMarks() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-4 left-4 size-4 border-t border-l border-mineral/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-4 right-4 size-4 border-t border-r border-mineral/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 left-4 size-4 border-b border-l border-mineral/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-4 bottom-4 size-4 border-r border-b border-mineral/40"
      />
    </>
  );
}

function SpecimenLabel({ children }) {
  return (
    <span className="font-mono-brand text-[11px] tracking-widest text-muted-foreground uppercase">
      {children}
    </span>
  );
}

SpecimenLabel.propTypes = {
  children: PropTypes.node.isRequired,
};

function PublicNav() {
  const [detached, setDetached] = useState(false);

  useEffect(() => {
    function onScroll() {
      setDetached(window.scrollY > 48);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-30 flex justify-center px-4 pt-4">
      <nav
        className={`flex w-full max-w-5xl items-center justify-between rounded-full px-5 py-3 transition-all duration-300 ${
          detached
            ? 'border border-mineral/15 bg-ink/70 shadow-lg backdrop-blur-md'
            : 'bg-transparent'
        }`}
      >
        <span className="font-display-brand text-lg font-bold text-mineral">Canary</span>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-full px-4 py-2 text-sm font-medium text-mineral/80 transition-colors hover:text-mineral"
          >
            Sign in
          </Link>
          <RegistrationPressButton as={Link} to="/signup" className="text-xs">
            Sign up
          </RegistrationPressButton>
        </div>
      </nav>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-ink px-6 pt-24 pb-16">
      <CornerMarks />
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <h1 className="font-display-brand leading-1.05 text-4xl font-bold text-mineral sm:text-5xl lg:text-6xl">
            Both sides earn the score.
            <br />
            Neither side can fake it.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-mineral/70">
            Canary scores Freelancers and Clients symmetrically, from real Engagement outcomes — not
            one-directional stars either party can buy. Every score comes with the evidence behind
            it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <RegistrationPressButton as={Link} to="/signup">
              Create your account
            </RegistrationPressButton>
            <Link
              to="/login"
              className="text-sm font-medium text-mineral/70 underline underline-offset-4 hover:text-mineral"
            >
              Already have one? Sign in
            </Link>
          </div>
        </div>
        <div className="relative lg:col-span-6">
          <RegistrationPlates className="mx-auto aspect-square w-full max-w-lg" />
          <p className="font-mono-brand mt-2 text-center text-[11px] tracking-widest text-mineral/40 uppercase">
            Move the cursor to register
          </p>
        </div>
      </div>
    </section>
  );
}

const FREELANCER_EVIDENCE = [
  { label: 'On-time delivery', direction: 'favorable' },
  { label: 'Scope creep initiated', direction: 'favorable' },
  { label: 'Client payment reliability', direction: 'unfavorable' },
];

const CLIENT_EVIDENCE = [
  { label: 'Paid in full, on terms', direction: 'favorable' },
  { label: 'Clear brief, few revisions', direction: 'favorable' },
  { label: 'Late payment on record', direction: 'unfavorable' },
];

function EvidenceSheet({ party, role, score, band, evidence, align }) {
  return (
    <div
      className={`relative rounded-lg border border-border bg-card p-6 shadow-sm ${
        align === 'end' ? 'lg:mt-16' : ''
      }`}
    >
      <CornerMarks />
      <div className="flex items-center justify-between">
        <SpecimenLabel>{party} sheet</SpecimenLabel>
        <span
          className={`font-mono-brand rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            band === 'high' ? 'bg-band-high-soft text-band-high' : 'bg-band-med-soft text-band-med'
          }`}
        >
          {score} · {band === 'high' ? 'high trust' : 'med trust'}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        As {role}, this Profile&rsquo;s TrustScore reflects only what actually happened on concluded
        Engagements.
      </p>
      <ul className="mt-5 space-y-2 border-t border-border pt-4">
        {evidence.map((item) => (
          <li key={item.label} className="flex items-center justify-between text-sm">
            <span className="text-foreground">{item.label}</span>
            <span
              className={`font-mono-brand text-xs ${
                item.direction === 'favorable' ? 'text-band-high' : 'text-destructive'
              }`}
            >
              {item.direction === 'favorable' ? 'favorable' : 'unfavorable'}
            </span>
          </li>
        ))}
      </ul>
      <p className="font-mono-brand mt-5 text-[10px] tracking-wide text-muted-foreground/70 uppercase">
        Illustrative example — synthetic data
      </p>
    </div>
  );
}

EvidenceSheet.propTypes = {
  party: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired,
  score: PropTypes.number.isRequired,
  band: PropTypes.oneOf(['high', 'med']).isRequired,
  evidence: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      direction: PropTypes.oneOf(['favorable', 'unfavorable']).isRequired,
    }),
  ).isRequired,
  align: PropTypes.oneOf(['start', 'end']),
};

EvidenceSheet.defaultProps = {
  align: 'start',
};

function TwoLedgers() {
  return (
    <section className="theme-chromatic-public bg-background px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <h2 className="font-display-brand text-3xl font-bold text-foreground sm:text-4xl">
            One Engagement, two independent sheets.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            When a Freelancer and a Client conclude an Engagement, each records an Outcome for the
            other. Both records feed both TrustScores. Neither Party can see or edit the
            other&rsquo;s evidence before the double-blind window closes.
          </p>
        </div>
        <div className="relative mt-14 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <EvidenceSheet
            party="Freelancer"
            role="freelancer"
            score={78}
            band="high"
            evidence={FREELANCER_EVIDENCE}
          />
          <EvidenceSheet
            party="Client"
            role="client"
            score={64}
            band="med"
            evidence={CLIENT_EVIDENCE}
            align="end"
          />
        </div>
      </div>
    </section>
  );
}

const PIPELINE = [
  {
    n: 1,
    title: 'JobPost',
    body: 'A Client publishes real terms — scope, budget, timeline.',
  },
  {
    n: 2,
    title: 'Proposal',
    body: 'A Freelancer checks the Client’s TrustScore, previews RiskAssessment, then bids.',
  },
  {
    n: 3,
    title: 'Engagement',
    body: 'Terms lock. Both Parties see the same RiskAssessment before committing.',
  },
  {
    n: 4,
    title: 'Outcome',
    body: 'Each Party records what happened. Reviews stay hidden until both sides submit.',
  },
  {
    n: 5,
    title: 'TrustScore',
    body: 'Concluded Outcomes feed the next scoring pass for both Profiles.',
  },
];

function Pipeline() {
  return (
    <section className="bg-ink px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display-brand text-3xl font-bold text-mineral sm:text-4xl">
          Every concluded Engagement teaches the next score.
        </h2>
        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-mineral/10 sm:grid-cols-5">
          {PIPELINE.map((step) => (
            <div key={step.n} className="bg-ink p-5">
              <span className="font-mono-brand text-xs text-vermilion">
                {String(step.n).padStart(2, '0')}
              </span>
              <h3 className="font-display-brand mt-2 text-base font-bold text-mineral">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-mineral/60">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Evidence() {
  return (
    <section className="theme-chromatic-public bg-background px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="font-display-brand text-3xl font-bold text-foreground sm:text-4xl">
              Every score names its RiskSignals.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A TrustScore is never a lone number. Open any Profile and the RiskSignals behind it
              are listed — each one favorable or unfavorable, each one traceable to a real recorded
              Outcome. Nothing is asserted without a signal you can inspect.
            </p>
            <p className="font-mono-brand mt-6 text-[11px] tracking-wide text-muted-foreground uppercase">
              Trust bands read as words and position, never color alone
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <SpecimenLabel>RiskSignal — illustrative</SpecimenLabel>
            <ul className="mt-4 space-y-3">
              {[
                { name: 'On-time delivery rate', dir: 'favorable', strength: 'Strong' },
                { name: 'Days late, last 3 Engagements', dir: 'unfavorable', strength: 'Weak' },
                { name: 'Scope creep initiated', dir: 'favorable', strength: 'Medium' },
              ].map((s) => (
                <li
                  key={s.name}
                  className="flex items-center justify-between border-t border-border pt-3 text-sm first:border-t-0 first:pt-0"
                >
                  <span className="text-foreground">{s.name}</span>
                  <span
                    className={`font-mono-brand text-xs ${
                      s.dir === 'favorable' ? 'text-band-high' : 'text-destructive'
                    }`}
                  >
                    {s.dir === 'favorable' ? 'Favorable' : 'Unfavorable'} · {s.strength}
                  </span>
                </li>
              ))}
            </ul>
            <p className="font-mono-brand mt-5 text-[10px] tracking-wide text-muted-foreground/70 uppercase">
              Synthetic data, not a real Profile
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-ink px-6 py-28 text-center">
      <CornerMarks />
      <div className="mx-auto max-w-2xl">
        <h2 className="font-display-brand text-3xl font-bold text-mineral sm:text-4xl">
          Register your first Profile.
        </h2>
        <p className="mt-4 text-base text-mineral/70">
          Freelancer or Client — either way, your standing starts from real work, not a purchased
          rating.
        </p>
        <div className="mt-8 flex justify-center">
          <RegistrationPressButton as={Link} to="/signup">
            Create your account
          </RegistrationPressButton>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 border-t border-mineral/10 pt-8 sm:flex-row">
        <span className="font-display-brand text-sm font-bold text-mineral/70">Canary</span>
        <p className="font-mono-brand text-center text-[11px] text-mineral/40 uppercase">
          Demo marketplace · synthetic data throughout
        </p>
        <div className="flex gap-4 text-sm text-mineral/60">
          <Link to="/login" className="hover:text-mineral">
            Sign in
          </Link>
          <Link to="/signup" className="hover:text-mineral">
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="theme-chromatic-public">
      <div
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: `<!--${DIRECTION_CONTRACT}-->` }}
      />
      <PublicNav />
      <Hero />
      <TwoLedgers />
      <Pipeline />
      <Evidence />
      <FinalCta />
      <Footer />
    </div>
  );
}
