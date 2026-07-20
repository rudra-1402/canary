import { describe, it, expect, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { startMemoryDb, stopMemoryDb, clearCollections } from './memoryDb.js';

describe('memoryDb helper', () => {
  afterAll(stopMemoryDb);

  it('connects mongoose to an in-memory server (readyState 1)', async () => {
    await startMemoryDb();
    expect(mongoose.connection.readyState).toBe(1);
  }, 60000);

  it('clearCollections runs without throwing on an empty db', async () => {
    await expect(clearCollections()).resolves.not.toThrow();
  });
});
