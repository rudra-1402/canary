import passport from 'passport';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  ResendVerificationRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  CreateProfileRequestSchema,
  SwitchProfileRequestSchema,
} from '@canary/shared';
import {
  registerLocal,
  markEmailVerified,
  setPasswordForIdentity,
  clearIdentitySessions,
} from './auth.service.js';
import {
  createProfileForIdentity,
  switchActiveProfile,
  listIdentityProfiles,
} from './profile.service.js';
import { getCurrentUser } from './getCurrentUser.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { issueToken, consumeToken } from '../lib/token.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import Identity from '../models/Identity.js';

// Email delivery must not fail or leak from user-facing flows (register still succeeds if mail is
// down; forgot/resend stay generic 200). Best-effort: log and continue.
async function bestEffortSend(promise) {
  try {
    await promise;
  } catch (err) {
    console.error('email send failed:', err.message);
  }
}

// eslint-disable-next-line no-unused-vars
export async function register(req, res, next) {
  const { email, password } = RegisterRequestSchema.parse(req.body);
  const identity = await registerLocal(email, password);
  // Anti-enumeration: same 201 whether or not the email already existed. If it did,
  // registerLocal returned null and we simply do not create a session.
  if (identity) {
    const raw = await issueToken(identity._id, 'email-verification');
    await bestEffortSend(sendVerificationEmail(identity.email, raw));
    // keepSessionInfo: passport regenerates the session on login (anti session-fixation);
    // without this the CSRF token issued before register/login is silently invalidated.
    await new Promise((resolve, reject) =>
      req.login(identity, { keepSessionInfo: true }, (e) => (e ? reject(e) : resolve())),
    );
  }
  res.status(201).json({ ok: true });
}

// Local login via passport-local. Custom callback so we shape the response + errors.
export function login(req, res, next) {
  LoginRequestSchema.parse(req.body);
  passport.authenticate('local', (err, identity) => {
    if (err) return next(err);
    if (!identity) return next(new UnauthorizedError('Invalid credentials'));
    req.login(identity, { keepSessionInfo: true }, (e) => (e ? next(e) : res.json({ ok: true })));
  })(req, res, next);
}

export function logout(req, res, next) {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.json({ ok: true }));
  });
}

export function me(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) return next(new UnauthorizedError());
  res.json(user);
}

export async function verifyEmail(req, res, next) {
  const identityId = await consumeToken(req.query.token, 'email-verification');
  if (!identityId) return next(new BadRequestError('Invalid or expired token'));
  await markEmailVerified(identityId);
  res.redirect(`${process.env.CLIENT_URL || '/'}?verified=1`);
}

export async function resendVerification(req, res) {
  const { email } = ResendVerificationRequestSchema.parse(req.body);
  const identity = await Identity.findOne({ email: email.toLowerCase().trim() });
  if (identity && !identity.emailVerified) {
    const raw = await issueToken(identity._id, 'email-verification');
    await bestEffortSend(sendVerificationEmail(identity.email, raw));
  }
  res.json({ ok: true }); // generic — no enumeration
}

export async function forgotPassword(req, res) {
  const { email } = ForgotPasswordRequestSchema.parse(req.body);
  const identity = await Identity.findOne({ email: email.toLowerCase().trim() });
  if (identity && identity.passwordHash) {
    const raw = await issueToken(identity._id, 'password-reset');
    await bestEffortSend(sendPasswordResetEmail(identity.email, raw));
  }
  res.json({ ok: true }); // generic — no enumeration
}

export async function resetPassword(req, res, next) {
  const { token, password } = ResetPasswordRequestSchema.parse(req.body);
  const identityId = await consumeToken(token, 'password-reset');
  if (!identityId) return next(new BadRequestError('Invalid or expired token'));
  await setPasswordForIdentity(identityId, password);
  await clearIdentitySessions(identityId);
  res.json({ ok: true });
}

export async function createProfile(req, res) {
  const body = CreateProfileRequestSchema.parse(req.body);
  const { identityId } = getCurrentUser(req);
  const profile = await createProfileForIdentity(identityId, body);
  res.status(201).json({ id: profile._id.toString(), role: profile.role });
}

export async function switchProfile(req, res) {
  const { profileId } = SwitchProfileRequestSchema.parse(req.body);
  const { identityId } = getCurrentUser(req);
  await switchActiveProfile(identityId, profileId);
  res.json({ ok: true });
}

export async function listProfiles(req, res) {
  const { identityId } = getCurrentUser(req);
  const profiles = await listIdentityProfiles(identityId);
  res.json(
    profiles.map((p) => ({ id: p._id.toString(), role: p.role, displayName: p.displayName })),
  );
}
