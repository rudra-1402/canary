import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/db/connection.js';
import Engagement from '../src/models/Engagement.js';
import Identity from '../src/models/Identity.js';
import JobPost from '../src/models/JobPost.js';
import Profile from '../src/models/Profile.js';
import Proposal from '../src/models/Proposal.js';
import RiskAssessment from '../src/models/RiskAssessment.js';
import RiskSignal from '../src/models/RiskSignal.js';

const uri = process.env.MONGODB_URI;
const databaseName = uri ? new URL(uri).pathname.slice(1).split('?')[0] : '';
if (!/_audit_|_verification_/i.test(databaseName)) {
  throw new Error('Refusing to run: MONGODB_URI must name an isolated audit/verification database');
}

const marker = `proposal-risk-${new mongoose.Types.ObjectId()}`;
const emails = [`${marker}-client@test.invalid`, `${marker}-freelancer@test.invalid`];
const ids = {
  identities: [],
  profiles: [],
  jobPosts: [],
  proposals: [],
  engagements: [],
  assessments: [],
};

async function registerParty(app, role, email) {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/auth/csrf-token')).body.csrfToken;
  const registration = await agent
    .post('/api/auth/register')
    .set('x-csrf-token', csrf)
    .send({ email, password: 'longenough1' });
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  const profile = await agent
    .post('/api/auth/profiles')
    .set('x-csrf-token', csrf)
    .send({ role, displayName: `${marker} ${role}` });
  assert.equal(profile.status, 201, JSON.stringify(profile.body));
  return { agent, csrf, profileId: profile.body.id };
}

async function cleanup() {
  const assessmentIds = ids.assessments.map((id) => new mongoose.Types.ObjectId(id));
  if (assessmentIds.length) {
    await RiskSignal.deleteMany({ parentType: 'RiskAssessment', parentId: { $in: assessmentIds } });
    await RiskAssessment.deleteMany({ _id: { $in: assessmentIds } });
  }
  if (ids.engagements.length) await Engagement.deleteMany({ _id: { $in: ids.engagements } });
  if (ids.proposals.length) await Proposal.deleteMany({ _id: { $in: ids.proposals } });
  if (ids.jobPosts.length) await JobPost.deleteMany({ _id: { $in: ids.jobPosts } });
  if (ids.profiles.length) await Profile.deleteMany({ _id: { $in: ids.profiles } });
  const identities = await Identity.find({ email: { $in: emails } })
    .select('_id')
    .lean();
  ids.identities = identities.map((identity) => identity._id.toString());
  if (identities.length)
    await Identity.deleteMany({ _id: { $in: identities.map((row) => row._id) } });
  if (ids.identities.length && mongoose.connection.collections.sessions) {
    await mongoose.connection.collections.sessions.deleteMany({
      $or: ids.identities.map((id) => ({ session: { $regex: id } })),
    });
  }
}

await connectDB(uri);
try {
  const app = createApp();
  const client = await registerParty(app, 'client', emails[0]);
  const freelancer = await registerParty(app, 'freelancer', emails[1]);
  ids.profiles.push(client.profileId, freelancer.profileId);

  const jobPost = await client.agent
    .post('/api/jobposts')
    .set('x-csrf-token', client.csrf)
    .send({
      title: `${marker} accessible analytics dashboard`,
      category: 'web-development',
      description:
        'Design and build an accessible analytics dashboard with five approved views, responsive behavior, documented empty states, and a final handoff.',
      skills: ['React', 'Accessibility'],
      jobType: 'fixed',
      budgetOrRate: 1200,
      experienceLevel: 'intermediate',
      projectLength: 'less-than-1-month',
      screeningQuestions: ['Share comparable work.'],
      action: 'publish',
    });
  assert.equal(jobPost.status, 201, JSON.stringify(jobPost.body));
  ids.jobPosts.push(jobPost.body.id);

  const proposal = await freelancer.agent
    .post('/api/proposals')
    .set('x-csrf-token', freelancer.csrf)
    .send({
      jobPostId: jobPost.body.id,
      bid: 1100,
      payModel: 'project',
      proposedDurationDays: 14,
      coverLetter: 'The scope and delivery plan are clear.',
      screeningAnswers: ['Comparable work is available in the Profile portfolio.'],
    });
  assert.equal(proposal.status, 201, JSON.stringify(proposal.body));
  ids.proposals.push(proposal.body.id);

  const assessment = await client.agent
    .post(`/api/proposals/${proposal.body.id}/risk-assessment`)
    .set('x-csrf-token', client.csrf)
    .send({});
  assert.equal(assessment.status, 200, JSON.stringify(assessment.body));
  ids.engagements.push(assessment.body.data.engagement.id);
  ids.assessments.push(assessment.body.data.riskAssessment.id);
  assert.equal(assessment.body.data.engagement.status, 'prospective');

  const acceptance = await client.agent
    .post(`/api/proposals/${proposal.body.id}/accept`)
    .set('x-csrf-token', client.csrf)
    .send({ confirm: true });
  assert.equal(acceptance.status, 200, JSON.stringify(acceptance.body));
  assert.equal(acceptance.body.data.engagement.id, assessment.body.data.engagement.id);
  assert.equal(acceptance.body.data.engagement.status, 'active');
  assert.equal(acceptance.body.data.riskAssessment.id, assessment.body.data.riskAssessment.id);

  const detail = await client.agent.get(`/api/engagements/${ids.engagements[0]}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.data.engagement.proposal.id, proposal.body.id);
  assert.equal(detail.body.data.engagement.riskAssessment.id, ids.assessments[0]);
  assert.equal(detail.body.data.engagement.outcomeEligibility, true);

  console.log(
    JSON.stringify({
      ok: true,
      database: databaseName,
      flow: 'register → JobPost → Proposal → RiskAssessment → accept → Engagement detail',
      engagementReused: true,
      cleanupMarker: marker,
    }),
  );
} finally {
  await cleanup();
  await disconnectDB();
}
