import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { resendVerification } from '../../lib/api/auth.js';
import { BASE_URL } from '../../lib/apiClient.js';
import Button from '../../components/ui/Button.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';

export default function SignUp() {
  const { status, register } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Anti-enumeration: the server returns the same 201 whether the email is new or already
  // registered, and only logs a new Identity in. If the session is still anonymous after
  // register(), we cannot say which case happened — so the message stays generic.
  const [pendingVerification, setPendingVerification] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/onboarding" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const authenticated = await register(email, password);
      if (authenticated) {
        navigate(location.state?.from?.pathname || '/onboarding', { replace: true });
      } else {
        setPendingVerification(true);
      }
    } catch (err) {
      setError(err.message || 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If <strong>{email}</strong> is a new address, we sent a verification link. If you
            already have an account, sign in instead.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-4 w-full"
            onClick={() => resendVerification(email)}
          >
            Resend verification email
          </Button>
          <Link to="/login" className="mt-4 block text-sm font-medium text-foreground underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You will choose Freelancer or Client next.
        </p>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>
          </div>

          {error && <ErrorNotice message={error} />}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <a
          href={`${BASE_URL}/auth/google`}
          className="mt-4 block w-full rounded-md border border-border bg-card px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-background"
        >
          Continue with Google
        </a>

        <Link
          to="/login"
          className="mt-6 block text-center text-sm text-muted-foreground underline"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
