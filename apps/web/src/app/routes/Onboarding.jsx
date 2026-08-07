import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { createProfile } from '../../lib/api/auth.js';
import { getProfile, updateProfile } from '../../lib/api/profiles.js';
import ProfileFieldsForm from '../../components/profile/ProfileFieldsForm.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import Button from '../../components/ui/Button.jsx';

export default function Onboarding() {
  const { identity, refresh } = useSession();
  const navigate = useNavigate();
  const activeProfile = identity?.activeProfile ?? null;

  const [state, setState] = useState('loading'); // loading | choose-role | edit | error
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [role, setRole] = useState('freelancer');
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) {
      setState('choose-role');
      return;
    }
    setState('loading');
    try {
      const data = await getProfile(activeProfile.id);
      setProfile(data);
      setState('edit');
    } catch (err) {
      setError(err.message || 'Could not load your Profile');
      setState('error');
    }
  }, [activeProfile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleCreateProfile(event) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createProfile(role, displayName);
      await refresh();
      setProfile({ displayName });
      setState('edit');
    } catch (err) {
      setError(err.message || 'Could not create your Profile');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(patch) {
    const result = await updateProfile(activeProfile.id, patch);
    if (result.onboarding.complete) {
      setTimeout(() => navigate('/'), 1200);
    }
    return result;
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading onboarding" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <ErrorNotice message={error} onRetry={load} />
      </div>
    );
  }

  if (state === 'choose-role') {
    return (
      <div className="mx-auto max-w-sm px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          How will you use Canary?
        </h1>
        <form onSubmit={handleCreateProfile} className="mt-8 space-y-4" noValidate>
          <div className="flex gap-3">
            <Button
              type="button"
              variant={role === 'freelancer' ? 'primary' : 'ghost'}
              onClick={() => setRole('freelancer')}
            >
              Freelancer
            </Button>
            <Button
              type="button"
              variant={role === 'client' ? 'primary' : 'ghost'}
              onClick={() => setRole('client')}
            >
              Client
            </Button>
          </div>
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-foreground">
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-ring focus:outline-none"
            />
          </div>
          {error && <ErrorNotice message={error} />}
          <Button type="submit" disabled={creating || !displayName.trim()} className="w-full">
            {creating ? 'Creating…' : 'Continue'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Complete your Profile
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Fields marked as missing below are required before your Profile is considered complete.
      </p>
      <div className="mt-8">
        <ProfileFieldsForm
          role={activeProfile.role}
          initialValues={profile}
          onSubmit={handleSave}
          submitLabel="Save and check completion"
        />
      </div>
    </div>
  );
}
