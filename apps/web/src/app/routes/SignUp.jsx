import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext.jsx';
import { resendVerification } from '../../lib/api/auth.js';
import Button from '../../components/ui/Button.jsx';
import ErrorNotice from '../../components/ui/ErrorNotice.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import AuthSplit from '../../components/landing/AuthSplit.jsx';
import RegistrationPressButton from '../../components/landing/RegistrationPressButton.jsx';

export default function SignUp() {
  const { status, register } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Anti-enumeration: the server returns the same 201 whether the email is new or already
  // registered, and only logs a new Identity in. If the session is still anonymous after
  // register(), we cannot say which case happened — so the message stays generic.
  const [pendingVerification, setPendingVerification] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/onboarding" replace />;
  }

  const passwordsMatch = confirmPassword === '' || password === confirmPassword;

  async function handleSubmit(event) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const authenticated = await register(email, password, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
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
      <AuthSplit>
        <h1 className="font-display-brand mt-8 text-2xl font-bold text-foreground">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If <strong>{email}</strong> is a new address, we sent a verification link. If you already
          have an account, sign in instead.
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
      </AuthSplit>
    );
  }

  return (
    <AuthSplit>
      <h1 className="font-display-brand mt-8 text-2xl font-bold text-foreground">
        Create your account
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You will choose Freelancer or Client next.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              required
              maxLength={80}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              required
              maxLength={80}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

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

        <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={!passwordsMatch}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <p className={`text-xs ${passwordsMatch ? 'text-muted-foreground' : 'text-destructive'}`}>
          {passwordsMatch ? 'At least 8 characters.' : 'Passwords do not match.'}
        </p>

        {error && <ErrorNotice message={error} />}

        <RegistrationPressButton
          type="submit"
          disabled={submitting || !passwordsMatch}
          className="w-full"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </RegistrationPressButton>
      </form>

      <Link to="/login" className="mt-6 block text-center text-sm text-muted-foreground underline">
        Already have an account? Sign in
      </Link>
    </AuthSplit>
  );
}
