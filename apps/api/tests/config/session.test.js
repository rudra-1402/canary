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
});
