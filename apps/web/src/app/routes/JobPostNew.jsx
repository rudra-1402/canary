import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { createJobPost } from '../../lib/api/jobPosts.js';
import Button from '../../components/ui/Button.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

const csv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const lines = (value) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

function initialForm() {
  return {
    title: '',
    category: '',
    description: '',
    skills: '',
    jobType: 'fixed',
    budgetOrRate: '',
    experienceLevel: 'intermediate',
    projectLength: 'less-than-1-month',
    hoursPerWeek: '',
    screeningQuestions: '',
  };
}

function toPayload(form, action) {
  return {
    title: form.title.trim(),
    category: form.category.trim(),
    description: form.description.trim(),
    skills: csv(form.skills),
    jobType: form.jobType,
    budgetOrRate: Number(form.budgetOrRate),
    experienceLevel: form.experienceLevel,
    projectLength: form.projectLength,
    ...(form.hoursPerWeek !== '' ? { hoursPerWeek: Number(form.hoursPerWeek) } : {}),
    screeningQuestions: lines(form.screeningQuestions),
    action,
  };
}

export default function JobPostNew() {
  const { identity } = useSession();
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState('idle'); // idle | submitting | done
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(action) {
    setStatus('submitting');
    setError(null);
    try {
      const jobPost = await createJobPost(toPayload(form, action));
      setCreated(jobPost);
      setStatus('done');
    } catch (err) {
      setError(err.message || 'Could not create JobPost');
      setStatus('idle');
    }
  }

  if (identity?.activeProfile?.role !== 'client') {
    return (
      <EmptyState
        title="Client Profile required"
        description="Only Client Profiles can create JobPosts."
      />
    );
  }

  if (status === 'done') {
    return (
      <div className="max-w-lg rounded-md border-2 border-foreground bg-card p-6">
        <p className="text-sm font-medium text-foreground">
          JobPost {created.status === 'open' ? 'published' : 'saved as draft'}.
        </p>
        <Link
          to="/job-posts"
          className="mt-3 inline-block text-sm font-medium text-primary underline"
        >
          Go to Manage Jobs &amp; Proposals
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Create a JobPost</h1>

      <form onSubmit={(event) => event.preventDefault()} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-foreground">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={form.title}
            onChange={(event) => setField('title', event.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-foreground">
            Category
          </label>
          <input
            id="category"
            type="text"
            value={form.category}
            onChange={(event) => setField('category', event.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-foreground">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="skills" className="block text-sm font-medium text-foreground">
            Skills (comma-separated)
          </label>
          <input
            id="skills"
            type="text"
            value={form.skills}
            onChange={(event) => setField('skills', event.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="jobType" className="block text-sm font-medium text-foreground">
              Job type
            </label>
            <select
              id="jobType"
              value={form.jobType}
              onChange={(event) => setField('jobType', event.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="fixed">Fixed</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          <div>
            <label htmlFor="budgetOrRate" className="block text-sm font-medium text-foreground">
              Budget / rate (USD)
            </label>
            <input
              id="budgetOrRate"
              type="number"
              min="1"
              value={form.budgetOrRate}
              onChange={(event) => setField('budgetOrRate', event.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="experienceLevel" className="block text-sm font-medium text-foreground">
              Experience level
            </label>
            <select
              id="experienceLevel"
              value={form.experienceLevel}
              onChange={(event) => setField('experienceLevel', event.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="entry">Entry</option>
              <option value="intermediate">Intermediate</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div>
            <label htmlFor="projectLength" className="block text-sm font-medium text-foreground">
              Project length
            </label>
            <select
              id="projectLength"
              value={form.projectLength}
              onChange={(event) => setField('projectLength', event.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            >
              <option value="less-than-1-month">Less than 1 month</option>
              <option value="1-to-3-months">1 to 3 months</option>
              <option value="3-to-6-months">3 to 6 months</option>
              <option value="more-than-6-months">More than 6 months</option>
            </select>
          </div>
        </div>
        {form.jobType === 'hourly' && (
          <div>
            <label htmlFor="hoursPerWeek" className="block text-sm font-medium text-foreground">
              Hours per week
            </label>
            <input
              id="hoursPerWeek"
              type="number"
              min="1"
              max="168"
              value={form.hoursPerWeek}
              onChange={(event) => setField('hoursPerWeek', event.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
            />
          </div>
        )}
        <div>
          <label htmlFor="screeningQuestions" className="block text-sm font-medium text-foreground">
            Screening questions (one per line, optional)
          </label>
          <textarea
            id="screeningQuestions"
            rows={3}
            value={form.screeningQuestions}
            onChange={(event) => setField('screeningQuestions', event.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>

        {error && <ErrorNotice message={error} />}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={status === 'submitting'}
            onClick={() => handleSubmit('save_draft')}
          >
            Save draft
          </Button>
          <Button
            type="button"
            disabled={status === 'submitting'}
            onClick={() => handleSubmit('publish')}
          >
            {status === 'submitting' ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </form>
    </div>
  );
}
