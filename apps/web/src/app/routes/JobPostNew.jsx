import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { createJobPost } from '../../lib/api/jobPosts.js';
import Button from '../../components/ui/Button.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
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
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            type="text"
            value={form.title}
            onChange={(event) => setField('title', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            type="text"
            value={form.category}
            onChange={(event) => setField('category', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={4}
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="skills">Skills (comma-separated)</Label>
          <Input
            id="skills"
            type="text"
            value={form.skills}
            onChange={(event) => setField('skills', event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="jobType">Job type</Label>
            <Select value={form.jobType} onValueChange={(value) => setField('jobType', value)}>
              <SelectTrigger id="jobType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budgetOrRate">Budget / rate (USD)</Label>
            <Input
              id="budgetOrRate"
              type="number"
              min="1"
              value={form.budgetOrRate}
              onChange={(event) => setField('budgetOrRate', event.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="experienceLevel">Experience level</Label>
            <Select
              value={form.experienceLevel}
              onValueChange={(value) => setField('experienceLevel', value)}
            >
              <SelectTrigger id="experienceLevel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entry">Entry</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="projectLength">Project length</Label>
            <Select
              value={form.projectLength}
              onValueChange={(value) => setField('projectLength', value)}
            >
              <SelectTrigger id="projectLength" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="less-than-1-month">Less than 1 month</SelectItem>
                <SelectItem value="1-to-3-months">1 to 3 months</SelectItem>
                <SelectItem value="3-to-6-months">3 to 6 months</SelectItem>
                <SelectItem value="more-than-6-months">More than 6 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {form.jobType === 'hourly' && (
          <div className="space-y-1.5">
            <Label htmlFor="hoursPerWeek">Hours per week</Label>
            <Input
              id="hoursPerWeek"
              type="number"
              min="1"
              max="168"
              value={form.hoursPerWeek}
              onChange={(event) => setField('hoursPerWeek', event.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="screeningQuestions">Screening questions (one per line, optional)</Label>
          <Textarea
            id="screeningQuestions"
            rows={3}
            value={form.screeningQuestions}
            onChange={(event) => setField('screeningQuestions', event.target.value)}
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
