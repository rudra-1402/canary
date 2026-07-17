import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { startMemoryDb, stopMemoryDb, clearCollections } from '../helpers/memoryDb.js';

vi.mock('../../src/lib/email.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));
import { sendVerificationEmail, sendPasswordResetEmail } from '../../src/lib/email.js';
import mongoose from 'mongoose';
import { clearIdentitySessions } from '../../src/auth/auth.service.js';

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
    expect(me.body).toMatchObject({
      email: 'new@user.com',
      emailVerified: false,
      activeProfile: null,
    });
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

  it('register sends a verification email to the new address', async () => {
    const { agent, token } = await agentWithCsrf();
    await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 'v@user.com', password: 'longenough1' });
    expect(sendVerificationEmail).toHaveBeenCalledWith('v@user.com', expect.any(String));
  });

  it('verify-email consumes the token and flips emailVerified', async () => {
    const { agent, token } = await agentWithCsrf();
    await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 'ver@user.com', password: 'longenough1' });
    const raw = sendVerificationEmail.mock.calls.at(-1)[1]; // the emailed token
    const res = await agent.get(`/api/auth/verify-email?token=${raw}`);
    expect([200, 302]).toContain(res.status);
    const me = await agent.get('/api/auth/me');
    expect(me.body.emailVerified).toBe(true);
  });

  it('resend-verification returns generic 200 for both known and unknown emails', async () => {
    const { agent, token } = await agentWithCsrf();
    await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 're@user.com', password: 'longenough1' });
    sendVerificationEmail.mockClear();
    const known = await agent
      .post('/api/auth/resend-verification')
      .set('x-csrf-token', token)
      .send({ email: 're@user.com' });
    expect(known.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    const unknown = await agent
      .post('/api/auth/resend-verification')
      .set('x-csrf-token', token)
      .send({ email: 'nobody@user.com' });
    expect(unknown.status).toBe(200);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1); // still 1 — no send for unknown
  });

  it('forgot-password sends a reset email only for a known local account, always 200', async () => {
    const { agent, token } = await agentWithCsrf();
    await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 'fp@user.com', password: 'longenough1' });
    const known = await agent
      .post('/api/auth/forgot-password')
      .set('x-csrf-token', token)
      .send({ email: 'fp@user.com' });
    expect(known.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('fp@user.com', expect.any(String));
    sendPasswordResetEmail.mockClear();
    const unknown = await agent
      .post('/api/auth/forgot-password')
      .set('x-csrf-token', token)
      .send({ email: 'ghost@user.com' });
    expect(unknown.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('reset-password sets a new password the user can log in with, old one fails', async () => {
    const { agent, token } = await agentWithCsrf();
    await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 'rp@user.com', password: 'oldpassword1' });
    await agent
      .post('/api/auth/forgot-password')
      .set('x-csrf-token', token)
      .send({ email: 'rp@user.com' });
    const raw = sendPasswordResetEmail.mock.calls.at(-1)[1];
    const reset = await agent
      .post('/api/auth/reset-password')
      .set('x-csrf-token', token)
      .send({ token: raw, password: 'brandnew123' });
    expect(reset.status).toBe(200);
    // fresh session: old password rejected, new accepted
    const a2 = request.agent(app);
    const t2 = (await a2.get('/api/auth/csrf-token')).body.csrfToken;
    const bad = await a2
      .post('/api/auth/login')
      .set('x-csrf-token', t2)
      .send({ email: 'rp@user.com', password: 'oldpassword1' });
    expect(bad.status).toBe(401);
    const t3 = (await a2.get('/api/auth/csrf-token')).body.csrfToken;
    const good = await a2
      .post('/api/auth/login')
      .set('x-csrf-token', t3)
      .send({ email: 'rp@user.com', password: 'brandnew123' });
    expect(good.status).toBe(200);
  });

  it('register still succeeds (201) when the verification email fails to send', async () => {
    const { agent, token } = await agentWithCsrf();
    sendVerificationEmail.mockRejectedValueOnce(new Error('smtp down'));
    const res = await agent
      .post('/api/auth/register')
      .set('x-csrf-token', token)
      .send({ email: 'nomail@user.com', password: 'longenough1' });
    expect(res.status).toBe(201);
  });

  it('clearIdentitySessions deletes the identity stored sessions (reset defense-in-depth)', async () => {
    const id = new mongoose.Types.ObjectId();
    const sessions = mongoose.connection.collection('sessions');
    await sessions.insertOne({
      _id: 'sid-clear-test',
      session: JSON.stringify({ cookie: {}, passport: { user: String(id) } }),
      expires: new Date(Date.now() + 100000),
    });
    await clearIdentitySessions(id);
    expect(await sessions.countDocuments({ _id: 'sid-clear-test' })).toBe(0);
  });
});
