import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import Identity from '../../src/models/Identity.js';
import {
  registerLocal,
  verifyLocalCredentials,
  findOrLinkGoogleIdentity,
} from '../../src/auth/auth.service.js';
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

describe('findOrLinkGoogleIdentity', () => {
  const google = { sub: 'google-sub-1', email: 'Person@Gmail.com' };

  it('creates a verified identity for a new google user', async () => {
    const id = await findOrLinkGoogleIdentity(google);
    expect(id.email).toBe('person@gmail.com');
    expect(id.authProviderId).toBe('google-sub-1');
    expect(id.emailVerified).toBe(true);
  });

  it('links google to an existing UNVERIFIED local identity and drops its unproven password (pre-hijack defense)', async () => {
    // Simulates an attacker pre-registering the victim's email locally (never verified),
    // then the real owner signing in with Google. The unproven local password must not
    // survive the link, or the attacker keeps access.
    await registerLocal('person@gmail.com', 'longenough1');
    const id = await findOrLinkGoogleIdentity(google);
    expect(id.authProviderId).toBe('google-sub-1');
    expect(id.emailVerified).toBe(true);
    expect(id.passwordHash).toBeFalsy();
    expect(await Identity.countDocuments({ email: 'person@gmail.com' })).toBe(1);
    // the pre-registration password no longer authenticates the account
    expect(await verifyLocalCredentials('person@gmail.com', 'longenough1')).toBeNull();
  });
});
