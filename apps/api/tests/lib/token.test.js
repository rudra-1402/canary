import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import VerificationToken from '../../src/models/VerificationToken.js';
import { issueToken, consumeToken } from '../../src/lib/token.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from '../helpers/memoryDb.js';
import mongoose from 'mongoose';

beforeAll(startMemoryDb, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

const identityId = new mongoose.Types.ObjectId();

describe('token util', () => {
  it('issues a raw token but stores only its hash', async () => {
    const raw = await issueToken(identityId, 'email-verification');
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const stored = await VerificationToken.findOne({ identityId });
    expect(stored.tokenHash).not.toBe(raw);
  });

  it('consumes a valid token once, returns identityId, then rejects reuse', async () => {
    const raw = await issueToken(identityId, 'password-reset');
    const id = await consumeToken(raw, 'password-reset');
    expect(String(id)).toBe(String(identityId));
    expect(await consumeToken(raw, 'password-reset')).toBeNull();
  });

  it('rejects a wrong type, a bad token, and an expired token', async () => {
    const raw = await issueToken(identityId, 'email-verification');
    expect(await consumeToken(raw, 'password-reset')).toBeNull();
    expect(await consumeToken('deadbeef', 'email-verification')).toBeNull();

    const expired = await issueToken(identityId, 'email-verification');
    // findOneAndUpdate + sort (not updateOne, whose `sort` option isn't reliably
    // supported across mongoose versions) targets exactly the just-issued doc.
    await VerificationToken.findOneAndUpdate(
      { usedAt: null, type: 'email-verification' },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
      { sort: { createdAt: -1 } },
    );
    expect(await consumeToken(expired, 'email-verification')).toBeNull();
  });
});
