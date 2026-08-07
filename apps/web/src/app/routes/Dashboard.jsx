import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { listJobPosts, listMyJobPosts } from '../../lib/api/jobPosts.js';
import { listMyProposals } from '../../lib/api/proposals.js';
import { listMyEngagements } from '../../lib/api/engagements.js';
import { getTrustScore } from '../../lib/api/trustScores.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import TrustBadge from '../../components/ui/TrustBadge.jsx';

function StatCard({ label, value, to }) {
  const content = (
    <>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </>
  );
  return to ? (
    <Link to={to} className="rounded-md border border-border bg-card p-4 hover:bg-background">
      {content}
    </Link>
  ) : (
    <div className="rounded-md border border-border bg-card p-4">{content}</div>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  to: PropTypes.string,
};

StatCard.defaultProps = {
  to: null,
};

async function loadFreelancerSummary() {
  const [openJobs, proposals, engagements] = await Promise.all([
    listJobPosts({ status: 'open', page: 1, pageSize: 1 }),
    listMyProposals(),
    listMyEngagements(),
  ]);
  return {
    stats: [
      { label: 'Open JobPosts', value: openJobs.pagination.total, to: '/' },
      { label: 'My Proposals', value: proposals.data.length, to: '/work' },
      {
        label: 'Active Engagements',
        value: engagements.data.filter((e) => e.status === 'active').length,
        to: '/work',
      },
    ],
  };
}

async function loadClientSummary() {
  const jobPosts = await listMyJobPosts({ page: 1, pageSize: 50 });
  const newProposals = jobPosts.data.reduce((sum, jp) => sum + jp.proposalCounts.submitted, 0);
  const engagements = await listMyEngagements();
  return {
    stats: [
      { label: 'My JobPosts', value: jobPosts.data.length, to: '/job-posts' },
      { label: 'New Proposals', value: newProposals, to: '/job-posts' },
      {
        label: 'Active Engagements',
        value: engagements.data.filter((e) => e.status === 'active').length,
        to: '/work',
      },
    ],
  };
}

export default function Dashboard() {
  const { identity } = useSession();
  const activeProfile = identity?.activeProfile;
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    if (!activeProfile) {
      setState({ status: 'ready', stats: [], trust: null });
      return;
    }
    setState({ status: 'loading' });
    try {
      const summary =
        activeProfile.role === 'client' ? await loadClientSummary() : await loadFreelancerSummary();
      let trust = null;
      try {
        trust = await getTrustScore(activeProfile.id);
      } catch {
        trust = null;
      }
      setState({ status: 'ready', stats: summary.stats, trust });
    } catch (err) {
      setState({ status: 'error', error: err.message || 'Failed to load dashboard' });
    }
  }, [activeProfile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="mt-6">
        <Spinner label="Loading dashboard" />
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        {state.trust && <TrustBadge entry={state.trust} clientName="My TrustScore" />}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          {state.stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        <section className="rounded-md border border-border bg-card p-5">
          <h2 className="text-sm font-medium text-foreground">Quick actions</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {activeProfile?.role === 'client' ? (
              <>
                <Link
                  to="/job-posts/new"
                  className="rounded-md border border-border px-3 py-2 font-medium text-foreground hover:bg-background"
                >
                  Create a JobPost
                </Link>
                <Link
                  to="/talent"
                  className="rounded-md border border-border px-3 py-2 font-medium text-foreground hover:bg-background"
                >
                  Find talent
                </Link>
                <Link
                  to="/job-posts"
                  className="rounded-md border border-border px-3 py-2 font-medium text-foreground hover:bg-background"
                >
                  Review Proposals
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/"
                  className="rounded-md border border-border px-3 py-2 font-medium text-foreground hover:bg-background"
                >
                  Find work
                </Link>
                <Link
                  to="/work"
                  className="rounded-md border border-border px-3 py-2 font-medium text-foreground hover:bg-background"
                >
                  Track my Proposals
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
