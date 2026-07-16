import Identity from '../models/Identity.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

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
// (unknown email, no local password, or wrong password) — same generic outcome.
export async function verifyLocalCredentials(email, password) {
  const identity = await Identity.findOne({ email: email.toLowerCase().trim() });
  if (!identity) return null;
  const ok = await verifyPassword(password, identity.passwordHash);
  return ok ? identity : null;
}
