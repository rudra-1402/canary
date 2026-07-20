import crypto from 'node:crypto';
import VerificationToken from '../models/VerificationToken.js';

const TTL_MS = {
  'email-verification': 24 * 60 * 60 * 1000,
  'password-reset': 60 * 60 * 1000,
};

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// Issue a token for identity+type. Returns the RAW token (emailed); only its hash is stored.
export async function issueToken(identityId, type) {
  const raw = crypto.randomBytes(32).toString('hex');
  await VerificationToken.create({
    identityId,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TTL_MS[type]),
  });
  return raw;
}

// Redeem a raw token of a type. Atomically claims an unused, unexpired token (marks it used) so
// concurrent redemptions can't both succeed. Returns identityId, or null.
export async function consumeToken(raw, type) {
  const doc = await VerificationToken.findOneAndUpdate(
    { tokenHash: hashToken(raw), type, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  return doc ? doc.identityId : null;
}
