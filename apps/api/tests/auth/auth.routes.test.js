import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from '../helpers/memoryDb.js';

let app;
beforeAll(async () => {
  await startMemoryDb();
  app = createApp();
}, 60000);
afterAll(stopMemoryDb);
afterEach(clearCollections);

async function agentWithCsrf() {
  const agent = request.agent(app);
  const res = await agent.get('/api/auth/csrf-token');
  return { agent, token: res.body.csrfToken };
}

describe('auth routes', () => {
  it('register -> me returns the identity (activeProfile null)', async () => {
    const { agent, token } = await agentWithCsrf();
    const reg = await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 'new@user.com', password: 'longenough1' });
    expect(reg.status).toBe(201);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'new@user.com', activeProfile: null });
  });

  it('rejects a mutation with no CSRF token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@y.com', password: 'longenough1' });
    expect(res.status).toBe(403);
  });

  it('login with correct creds then me works; wrong creds 401', async () => {
    const { agent, token } = await agentWithCsrf();
    await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 'log@in.com', password: 'longenough1' });
    await agent.post('/api/auth/logout').set('x-csrf-token', token);
    // logout destroys the session (and its CSRF secret) — the client must fetch a
    // fresh token before the next mutation, exactly as a real SPA would after logout.
    const fresh = await agent.get('/api/auth/csrf-token');
    const token2 = fresh.body.csrfToken;
    const bad = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', token2)
      .send({ email: 'log@in.com', password: 'wrong' });
    expect(bad.status).toBe(401);
    const good = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', token2)
      .send({ email: 'log@in.com', password: 'longenough1' });
    expect(good.status).toBe(200);
  });

  it('me is 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
