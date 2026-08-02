import { useCallback, useEffect, useState } from 'react';
import { listJobPosts } from '../../lib/api/jobPosts.js';
import { getTrustScoresBatch } from '../../lib/api/trustScores.js';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import TrustBadge from '../../components/ui/TrustBadge.jsx';

const budgetFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
});

function budgetLabel(post) {
  const amount = budgetFormatter.format(post.budgetOrRate);
  return post.jobType === 'hourly' ? `${amount}/hr` : amount;
}

export default function FindWork() {
  const [state, setState] = useState({ status: 'loading', posts: [], trustByProfile: {} });

  const load = useCallback(async () => {
    setState({ status: 'loading', posts: [], trustByProfile: {} });
    try {
      const result = await listJobPosts({ status: 'open', page: 1, pageSize: 20 });
      const posts = result.data;

      // Trust bands are a nice-to-have on this list; if the batch call fails
      // (e.g. no marketplace Profile yet) the list still renders, just
      // without bands — TrustBadge already degrades to "No score yet".
      let trustByProfile = {};
      const clientIds = [...new Set(posts.map((p) => p.clientProfileId))].slice(0, 50);
      if (clientIds.length > 0) {
        try {
          const trustResult = await getTrustScoresBatch(clientIds);
          trustByProfile = Object.fromEntries(
            trustResult.data.map((entry) => [entry.profileId, entry]),
          );
        } catch {
          trustByProfile = {};
        }
      }

      setState({ status: 'ready', posts, trustByProfile });
    } catch (err) {
      setState({
        status: 'error',
        posts: [],
        trustByProfile: {},
        error: err.message || 'Failed to load job posts',
      });
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: no data-fetching library is in scope for this slice
    // (PLAN-UI Part D), so this is deliberate, not an oversight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Find Work</h1>

      {state.status === 'loading' && (
        <div className="mt-6">
          <Spinner label="Loading job posts" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-6">
          <ErrorNotice message={state.error} onRetry={load} />
        </div>
      )}

      {state.status === 'ready' && state.posts.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No open job posts right now"
            description="Check back soon — new posts appear here as clients publish them."
          />
        </div>
      )}

      {state.status === 'ready' && state.posts.length > 0 && (
        <>
          <p className="mt-1 text-sm text-muted">{state.posts.length} open job posts.</p>
          <ul className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
            {state.posts.map((post) => (
              <li key={post.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-medium text-ink">{post.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {budgetLabel(post)} · {post.experienceLevel}
                    {post.createdAt &&
                      ` · Posted ${dateFormatter.format(new Date(post.createdAt))}`}
                  </p>
                </div>
                <TrustBadge entry={state.trustByProfile[post.clientProfileId]} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
