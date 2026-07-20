import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import Identity from '../../src/models/Identity.js';
import {
  createProfileForIdentity,
  switchActiveProfile,
  listIdentityProfiles,
} from '../../src/auth/profile.service.js';
import { ForbiddenError } from '../../src/lib/errors.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from '../helpers/memoryDb.js';

beforeAll(startMemoryDb, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

async function newIdentity() {
  return Identity.create({ email: `u${Math.random()}@x.com`, passwordHash: 'h' });
}

describe('createProfileForIdentity', () => {
  it('creates a user-registered profile and makes the first one active', async () => {
    const id = await newIdentity();
    const profile = await createProfileForIdentity(id._id, {
      role: 'freelancer',
      displayName: 'Jo',
    });
    expect(profile.role).toBe('freelancer');
    expect(profile.origin).toBe('user-registered');
    const reloaded = await Identity.findById(id._id);
    expect(String(reloaded.activeProfileId)).toBe(String(profile._id));
  });

  it('allows a second profile of the other role but keeps the active one', async () => {
    const id = await newIdentity();
    const first = await createProfileForIdentity(id._id, { role: 'freelancer', displayName: 'Jo' });
    const second = await createProfileForIdentity(id._id, {
      role: 'client',
      displayName: 'Jo Inc',
    });
    expect(second.role).toBe('client');
    const reloaded = await Identity.findById(id._id);
    expect(String(reloaded.activeProfileId)).toBe(String(first._id));
  });

  it('rejects a duplicate role for the same identity (<=1 per role, ADR-0008)', async () => {
    const id = await newIdentity();
    await createProfileForIdentity(id._id, { role: 'freelancer', displayName: 'Jo' });
    await expect(
      createProfileForIdentity(id._id, { role: 'freelancer', displayName: 'Jo2' }),
    ).rejects.toThrow();
  });
});

describe('switchActiveProfile', () => {
  it('switches to a profile the identity owns', async () => {
    const id = await newIdentity();
    await createProfileForIdentity(id._id, { role: 'freelancer', displayName: 'Jo' });
    const c = await createProfileForIdentity(id._id, { role: 'client', displayName: 'Jo Inc' });
    await switchActiveProfile(id._id, c._id);
    expect(String((await Identity.findById(id._id)).activeProfileId)).toBe(String(c._id));
  });
  it('rejects switching to a profile owned by another identity', async () => {
    const a = await newIdentity();
    const b = await newIdentity();
    const bProfile = await createProfileForIdentity(b._id, {
      role: 'freelancer',
      displayName: 'B',
    });
    await expect(switchActiveProfile(a._id, bProfile._id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('listIdentityProfiles', () => {
  it('returns all profiles for the identity', async () => {
    const id = await newIdentity();
    await createProfileForIdentity(id._id, { role: 'freelancer', displayName: 'Jo' });
    await createProfileForIdentity(id._id, { role: 'client', displayName: 'Jo Inc' });
    expect(await listIdentityProfiles(id._id)).toHaveLength(2);
  });
});
