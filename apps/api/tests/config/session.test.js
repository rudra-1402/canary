import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { buildSessionMiddleware } from '../../src/config/session.js';
import { startMemoryDb, stopMemoryDb } from '../helpers/memoryDb.js';

describe('buildSessionMiddleware', () => {
  it('returns a middleware function given a live mongoose connection', async () => {
    await startMemoryDb();
    const mw = buildSessionMiddleware(mongoose.connection);
    expect(typeof mw).toBe('function');
    await stopMemoryDb();
  }, 60000);

  it('throws in production when SESSION_SECRET is unset (no forgeable-cookie fallback)', () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    try {
      expect(() => buildSessionMiddleware(mongoose.connection)).toThrow('SESSION_SECRET');
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = origSecret;
    }
  });
});
