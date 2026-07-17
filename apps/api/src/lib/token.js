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

// Redeem a raw token of a type. Returns identityId if valid (unused, unexpired) and marks it
// used; null otherwise.
export async function consumeToken(raw, type) {
  const doc = await VerificationToken.findOne({ tokenHash: hashToken(raw), type });
  if (!doc || doc.usedAt || doc.expiresAt < new Date()) return null;
  doc.usedAt = new Date();
  await doc.save();
  return doc.identityId;
}
