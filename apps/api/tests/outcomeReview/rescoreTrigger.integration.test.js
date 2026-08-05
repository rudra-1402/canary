import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import Profile from '../../src/models/Profile.js';
import Identity from '../../src/models/Identity.js';
import Engagement from '../../src/models/Engagement.js';
import Outcome from '../../src/models/Outcome.js';
import Review from '../../src/models/Review.js';
import TrustScore from '../../src/models/TrustScore.js';
import { createOutcomeReview } from '../../src/outcomeReview/outcomeReview.service.js';
import { getTrustScore } from '../../src/trustScore/trustScore.service.js';
import {
  clearCollections,
  getMemoryDbUri,
  startMemoryDb,
  stopMemoryDb,
} from '../helpers/memoryDb.js';
import {
  INTELLIGENCE_DIRECTORY,
  RESCORE_ARTIFACT_PATH,
  RESCORE_INTEGRATION_READY,
  RESCORE_PYTHON_PATH,
} from '../helpers/seedGate.js';

const originalEnv = { ...process.env };
const intelligenceDirectory = INTELLIGENCE_DIRECTORY;

async function profile(role) {
  const identity = await Identity.create({
    email: `${new mongoose.Types.ObjectId()}@test.invalid`,
  });
  return Profile.create({
    identityId: identity._id,
    role,
    origin: 'user-registered',
    displayName: `${role} Profile`,
  });
}

function terms() {
  return {
    scope: 'Deliver the work',
    price: 1000,
    paymentTerms: 'On completion',
    timeline: 'Two weeks',
    dueAt: new Date('2026-02-01T00:00:00.000Z'),
  };
}

function submission(role, engagementId) {
  return {
    engagementId: String(engagementId),
    outcome:
      role === 'freelancer'
        ? {
            observed: true,
            deliveredAt: null,
            daysLate: null,
            paidInFull: true,
            revisionsRequested: 0,
            scopeCreepOccurred: false,
            endedAs: 'completed',
          }
        : {
            observed: true,
            deliveredAt: new Date('2026-01-30T00:00:00.000Z'),
            daysLate: -2,
            paidInFull: null,
            revisionsRequested: null,
            scopeCreepOccurred: null,
            endedAs: 'completed',
          },
    review: { rating: 5, text: 'Excellent.' },
  };
}

async function concludedHistory(freelancer, client) {
  const engagement = await Engagement.create({
    freelancerProfileId: freelancer._id,
    clientProfileId: client._id,
    status: 'concluded',
    agreedTerms: terms(),
  });
  await Outcome.create({
    engagementId: engagement._id,
    subjectProfileId: freelancer._id,
    counterpartyProfileId: client._id,
    subjectRole: 'freelancer',
    observed: true,
    deliveredAt: new Date('2026-01-30T00:00:00.000Z'),
    daysLate: -2,
    paidInFull: null,
    revisionsRequested: null,
    scopeCreepOccurred: null,
    ghosted: false,
    endedAs: 'completed',
    labelSource: 'counterparty-reported',
  });
  await Outcome.create({
    engagementId: engagement._id,
    subjectProfileId: client._id,
    counterpartyProfileId: freelancer._id,
    subjectRole: 'client',
    observed: true,
    deliveredAt: null,
    daysLate: null,
    paidInFull: true,
    revisionsRequested: 0,
    scopeCreepOccurred: false,
    ghosted: false,
    endedAs: 'completed',
    labelSource: 'counterparty-reported',
  });
  await Review.create({
    engagementId: engagement._id,
    authorProfileId: freelancer._id,
    subjectProfileId: client._id,
    rating: 5,
    visibleAt: new Date(),
  });
  await Review.create({
    engagementId: engagement._id,
    authorProfileId: client._id,
    subjectProfileId: freelancer._id,
    rating: 5,
    visibleAt: new Date(),
  });
}

async function waitForScores(profileIds) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const count = await TrustScore.countDocuments({
      profileId: { $in: profileIds },
      status: 'scored',
    });
    if (count === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('The real rescore subprocess did not write both scored snapshots');
}

beforeAll(async () => {
  await startMemoryDb();
}, 60000);
afterAll(stopMemoryDb);
afterEach(async () => {
  process.env = { ...originalEnv };
  await clearCollections();
});

// Needs the trained model artifact and the intelligence venv — neither is in git, so this skips
// in CI rather than failing on a missing file. See helpers/seedGate.js.
describe.skipIf(!RESCORE_INTEGRATION_READY)('rescore trigger integration', () => {
  it('uses the real subprocess to score both Profiles after mutual conclusion', async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'canary-rescore-'));
    const temporaryArtifact = path.join(temporaryDirectory, 'model.joblib');
    await copyFile(RESCORE_ARTIFACT_PATH, temporaryArtifact);
    process.env.RESCORE_ON_CONCLUSION_ENABLED = 'true';
    process.env.RESCORE_PYTHON = RESCORE_PYTHON_PATH;
    process.env.RESCORE_WORKING_DIRECTORY = intelligenceDirectory;
    process.env.RESCORE_ARTIFACT = temporaryArtifact;
    process.env.MONGODB_URI = getMemoryDbUri();

    try {
      const freelancer = await profile('freelancer');
      const client = await profile('client');
      await concludedHistory(freelancer, client);
      await concludedHistory(freelancer, client);
      const engagement = await Engagement.create({
        freelancerProfileId: freelancer._id,
        clientProfileId: client._id,
        status: 'active',
        agreedTerms: terms(),
      });

      await createOutcomeReview(submission('freelancer', engagement._id), freelancer._id);
      await createOutcomeReview(submission('client', engagement._id), client._id);
      await waitForScores([freelancer._id, client._id]);

      await expect(
        getTrustScore(String(freelancer._id), freelancer.identityId),
      ).resolves.toMatchObject({
        status: 'scored',
      });
      await expect(getTrustScore(String(client._id), client.identityId)).resolves.toMatchObject({
        status: 'scored',
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 60000);
});
