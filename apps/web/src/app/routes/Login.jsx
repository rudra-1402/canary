import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { BASE_URL } from '../../lib/apiClient.js';
import Button from '../../components/ui/Button.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';

export default function Login() {
  const { status, login } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="theme-chromatic-public flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Canary</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your account.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <ErrorNotice message={error} />}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full"
            style={{ borderRadius: '9999px' }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {/* Full-page navigation, not a router Link — this leaves the SPA for Passport's redirect flow. */}
        <a
          href={`${BASE_URL}/auth/google`}
          className="mt-4 block w-full rounded-md border border-border bg-card px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-background"
        >
          Continue with Google
        </a>

        <Link
          to="/signup"
          className="mt-6 block text-center text-sm text-muted-foreground underline"
        >
          Need an account? Sign up
        </Link>
      </div>
    </div>
  );
}
