import Identity from '../models/Identity.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../lib/password.js';

// Register a local account. Returns null (no duplicate) if the email exists, so the caller
// can respond generically — no user enumeration.
export async function registerLocal(email, password) {
  const normalized = email.toLowerCase().trim();
  const existing = await Identity.findOne({ email: normalized });
  if (existing) return null;
  const passwordHash = await hashPassword(password);
  return Identity.create({ email: normalized, passwordHash, emailVerified: false });
}

// Verify local credentials; null on any failure. Always runs one bcrypt compare (dummy hash
// when the account is absent/social-only) so timing can't reveal whether an email has a
// local password.
export async function verifyLocalCredentials(email, password) {
  const identity = await Identity.findOne({ email: email.toLowerCase().trim() });
  const ok = await verifyPassword(password, identity?.passwordHash || DUMMY_HASH);
  return ok && identity ? identity : null;
}

// Resolve a Google profile to an Identity, keyed by email (link, never duplicate). If the
// existing account was an UNVERIFIED local registration, drop its passwordHash — that
// password was never proven to be the owner's, so keeping it enables pre-hijacking.
export async function findOrLinkGoogleIdentity({ sub, email }) {
  const normalized = email.toLowerCase().trim();
  const existing = await Identity.findOne({ email: normalized });
  if (existing) {
    existing.authProviderId = sub;
    if (!existing.emailVerified) existing.passwordHash = undefined;
    existing.emailVerified = true;
    await existing.save();
    return existing;
  }
  return Identity.create({ email: normalized, authProviderId: sub, emailVerified: true });
}
