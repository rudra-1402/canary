import passport from 'passport';
import { RegisterRequestSchema, LoginRequestSchema } from '@canary/shared';
import { registerLocal, markEmailVerified } from './auth.service.js';
import { getCurrentUser } from './getCurrentUser.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { issueToken, consumeToken } from '../lib/token.js';
import { sendVerificationEmail } from '../lib/email.js';

// eslint-disable-next-line no-unused-vars
export async function register(req, res, next) {
  const { email, password } = RegisterRequestSchema.parse(req.body);
  const identity = await registerLocal(email, password);
  // Anti-enumeration: same 201 whether or not the email already existed. If it did,
  // registerLocal returned null and we simply do not create a session.
  if (identity) {
    const raw = await issueToken(identity._id, 'email-verification');
    await sendVerificationEmail(identity.email, raw);
    await new Promise((resolve, reject) => req.login(identity, (e) => (e ? reject(e) : resolve())));
  }
  res.status(201).json({ ok: true });
}

// Local login via passport-local. Custom callback so we shape the response + errors.
export function login(req, res, next) {
  LoginRequestSchema.parse(req.body);
  passport.authenticate('local', (err, identity) => {
    if (err) return next(err);
    if (!identity) return next(new UnauthorizedError('Invalid credentials'));
    req.login(identity, (e) => (e ? next(e) : res.json({ ok: true })));
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
