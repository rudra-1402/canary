import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import AuthSplit from '../../components/landing/AuthSplit.jsx';
import RegistrationPressButton from '../../components/landing/RegistrationPressButton.jsx';

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
    // The form has `noValidate` (below), so the native required attributes never
    // fire — this is the only real check that these aren't empty before we hit
    // the API (backend still enforces its own rules; this just avoids a round
    // trip for an obviously incomplete form).
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
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
    <AuthSplit>
      <h1 className="font-display-brand mt-8 text-2xl font-bold text-foreground">Welcome back</h1>
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

        <RegistrationPressButton type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </RegistrationPressButton>
      </form>

      <Link to="/signup" className="mt-6 block text-center text-sm text-muted-foreground underline">
        Need an account? Sign up
      </Link>
    </AuthSplit>
  );
}
