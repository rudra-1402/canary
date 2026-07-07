import { describe, it, expect } from 'vitest';
import { connectDB, disconnectDB } from '../../src/db/connection.js';

describe('connectDB', () => {
  it('throws a clear error when no URI is available', async () => {
    const original = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    await expect(connectDB(undefined)).rejects.toThrow('MONGODB_URI is not set');
    if (original) process.env.MONGODB_URI = original;
  });

  it('connects to a real MongoDB instance and reports readyState 1', async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/canary_test';
    const connection = await connectDB(uri);
    expect(connection.readyState).toBe(1);
    await disconnectDB();
  });
});
