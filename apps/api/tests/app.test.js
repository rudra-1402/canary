import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startMemoryDb, stopMemoryDb } from './helpers/memoryDb.js';

describe('GET /api/health', () => {
  let app;
  beforeAll(async () => {
    await startMemoryDb();
    app = createApp();
  }, 60000);
  afterAll(stopMemoryDb);

  it('returns the health payload over HTTP', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(() => new Date(response.body.timestamp).toISOString()).not.toThrow();
  });
});
