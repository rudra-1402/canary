import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import Identity from '../../src/models/Identity.js';
import { registerLocal, verifyLocalCredentials } from '../../src/auth/auth.service.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from '../helpers/memoryDb.js';

beforeAll(startMemoryDb, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

describe('registerLocal', () => {
  it('creates an unverified local identity and stores a hash (not the password)', async () => {
    const identity = await registerLocal('New@User.com', 'longenough1');
    expect(identity.email).toBe('new@user.com');
    expect(identity.emailVerified).toBe(false);
    expect(identity.passwordHash).toBeTruthy();
    expect(identity.passwordHash).not.toBe('longenough1');
  });

  it('returns null (no duplicate, no throw) when the email already exists', async () => {
    await registerLocal('dup@user.com', 'longenough1');
    const second = await registerLocal('dup@user.com', 'another-one-1');
    expect(second).toBeNull();
    expect(await Identity.countDocuments({ email: 'dup@user.com' })).toBe(1);
  });
});

describe('verifyLocalCredentials', () => {
  it('returns the identity for correct credentials, null otherwise', async () => {
    await registerLocal('log@in.com', 'longenough1');
    expect(await verifyLocalCredentials('log@in.com', 'longenough1')).not.toBeNull();
    expect(await verifyLocalCredentials('log@in.com', 'wrong')).toBeNull();
    expect(await verifyLocalCredentials('missing@in.com', 'whatever1')).toBeNull();
  });
});
