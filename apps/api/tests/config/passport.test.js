import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import passport from 'passport';
import Identity from '../../src/models/Identity.js';
import { configurePassport } from '../../src/config/passport.js';
import { startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

describe('configurePassport', () => {
  beforeAll(async () => {
    await startMemoryDb();
    configurePassport();
  }, 60000);
  afterAll(stopMemoryDb);

  it('serializes to identityId and deserializes back to the Identity', async () => {
    const identity = await Identity.create({ email: 'ser@de.com', passwordHash: 'x' });
    const id = await new Promise((res, rej) =>
      passport.serializeUser(identity, (e, v) => (e ? rej(e) : res(v))),
    );
    expect(id).toBe(identity._id.toString());
    const back = await new Promise((res, rej) =>
      passport.deserializeUser(id, (e, v) => (e ? rej(e) : res(v))),
    );
    expect(back.email).toBe('ser@de.com');
  });
});
