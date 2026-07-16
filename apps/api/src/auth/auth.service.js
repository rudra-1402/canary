import Identity from '../models/Identity.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../lib/password.js';

// Register a local account. Returns the new Identity, or null if the email already
// exists (caller responds generically — no user enumeration). Never creates a duplicate.
export async function registerLocal(email, password) {
  const normalized = email.toLowerCase().trim();
  const existing = await Identity.findOne({ email: normalized });
  if (existing) return null;
  const passwordHash = await hashPassword(password);
  return Identity.create({ email: normalized, passwordHash, emailVerified: false });
}

// Verify local credentials. Returns the Identity on success, null on any failure
// (unknown email, no local password, or wrong password). Always runs exactly one bcrypt
// compare — against a dummy hash when the account is absent or social-only — so response
// time never reveals whether an email has a local password (timing-enumeration defense).
export async function verifyLocalCredentials(email, password) {
  const identity = await Identity.findOne({ email: email.toLowerCase().trim() });
  const ok = await verifyPassword(password, identity?.passwordHash || DUMMY_HASH);
  return ok && identity ? identity : null;
}

// Resolve a Google profile to an Identity, keyed by email. New email -> create a verified
// identity. Existing email -> link the Google sub and mark verified. If that existing
// account was a local, still-UNVERIFIED registration, its passwordHash is dropped: the
// local password was never proven to belong to the now-Google-verified owner, so keeping
// it would let a pre-registration attacker retain access (account pre-hijacking). Never
// duplicates. `googleProfile` = { sub, email }.
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
