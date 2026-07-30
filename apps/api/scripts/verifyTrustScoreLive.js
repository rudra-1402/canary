import assert from 'node:assert/strict';
import request from 'supertest';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import { createApp } from '../src/app.js';
import Identity from '../src/models/Identity.js';
import Profile from '../src/models/Profile.js';
import Engagement from '../src/models/Engagement.js';
import { hashPassword } from '../src/lib/password.js';
import { MIN_ENGAGEMENTS_FOR_SCORING } from '../src/trustScore/scoringConfig.js';

const email = 'verify-trust-score-live@canary.invalid';
const password = 'trust-score-live-password';

async function profileIdsByOutcomeCount() {
  const rows = await Engagement.aggregate([
    { $match: { status: 'concluded' } },
    {
      $lookup: { from: 'outcomes', localField: '_id', foreignField: 'engagementId', as: 'outcome' },
    },
    { $unwind: '$outcome' },
    { $project: { profileIds: ['$freelancerProfileId', '$clientProfileId'] } },
    { $unwind: '$profileIds' },
    { $group: { _id: '$profileIds', count: { $sum: 1 } } },
  ]);
  return {
    scoreable: rows.find((row) => row.count >= MIN_ENGAGEMENTS_FOR_SCORING)?._id,
    cold: rows.find((row) => row.count < MIN_ENGAGEMENTS_FOR_SCORING)?._id,
  };
}

async function main() {
  await connectDB(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/canary_dev');
  const app = createApp();
  let identity;
  let profile;
  try {
    identity = await Identity.create({
      email,
      passwordHash: await hashPassword(password),
      emailVerified: true,
    });
    profile = await Profile.create({
      identityId: identity._id,
      role: 'freelancer',
      origin: 'user-registered',
      displayName: 'Trust Score verifier',
    });
    const agent = request.agent(app);
    const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
    assert.equal(
      (await agent.post('/api/auth/login').set('x-csrf-token', csrf).send({ email, password }))
        .status,
      200,
    );
    const { scoreable, cold } = await profileIdsByOutcomeCount();
    assert.ok(scoreable && cold, 'live seed must contain scoreable and cold-start profiles');
    const scored = await agent.get(`/api/trust-scores/${scoreable}`);
    assert.equal(scored.status, 200);
    assert.ok(['scored', 'stale'].includes(scored.body.status));
    assert.equal(typeof scored.body.score, 'number');
    assert.equal(typeof scored.body.band, 'string');
    assert.equal(scored.body.signals, undefined);
    const insufficient = await agent.get(`/api/trust-scores/${cold}`);
    assert.equal(insufficient.status, 200);
    assert.equal(insufficient.body.status, 'insufficient-history');
    console.log('Trust Score live HTTP verification passed.');
  } finally {
    if (profile) await Profile.deleteOne({ _id: profile._id });
    if (identity) await Identity.deleteOne({ _id: identity._id });
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
