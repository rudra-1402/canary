import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useSession } from '../session/SessionContext.jsx';
import { listProfiles, switchProfile } from '../../lib/api/auth.js';
import { getProfile, updateProfile } from '../../lib/api/profiles.js';
import ProfileFieldsForm from '../../components/profile/ProfileFieldsForm.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Button from '../../components/ui/Button.jsx';

export default function Settings() {
  const { identity, refresh, logout } = useSession();
  const activeProfile = identity?.activeProfile ?? null;

  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) {
      setState('ready');
      return;
    }
    setState('loading');
    try {
      const [profileList, ownProfile] = await Promise.all([
        listProfiles(),
        getProfile(activeProfile.id),
      ]);
      setProfiles(profileList);
      setProfile(ownProfile);
      setState('ready');
    } catch (err) {
      setError(err.message || 'Could not load settings');
      setState('error');
    }
  }, [activeProfile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleSwitch(profileId) {
    setSwitching(true);
    try {
      await switchProfile(profileId);
      await refresh();
      toast.success('Switched active Profile.');
    } catch (err) {
      const message = err.message || 'Could not switch Profile';
      setError(message);
      toast.error(message);
    } finally {
      setSwitching(false);
    }
  }

  async function handleSave(patch) {
    return updateProfile(activeProfile.id, patch);
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading settings" />
      </div>
    );
  }

  if (state === 'error') {
    return <ErrorNotice message={error} onRetry={load} />;
  }

  if (!activeProfile) {
    return (
      <EmptyState
        title="No active Profile"
        description="Finish onboarding to create a Profile before editing settings."
      />
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Your profiles</h2>
        <ul className="mt-3 space-y-2">
          {profiles.map((item) => (
            <li key={item.id} className="flex items-center justify-between text-sm">
              <span className="text-foreground">
                {item.displayName} — {item.role}
                {item.id === activeProfile.id && (
                  <span className="ml-2 text-muted-foreground">(active)</span>
                )}
              </span>
              {item.id !== activeProfile.id && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={switching}
                  onClick={() => handleSwitch(item.id)}
                >
                  Switch
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Edit Profile</h2>
        {error && <ErrorNotice message={error} />}
        {profile && (
          <div className="mt-3 max-w-lg">
            <ProfileFieldsForm
              role={activeProfile.role}
              initialValues={profile}
              onSubmit={handleSave}
            />
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Account</h2>
        <div className="mt-3 flex items-center gap-4">
          <Link to="/onboarding" className="text-sm font-medium text-foreground underline">
            Review onboarding
          </Link>
          <Button type="button" variant="ghost" onClick={logout}>
            Log out
          </Button>
        </div>
      </section>
    </div>
  );
}
