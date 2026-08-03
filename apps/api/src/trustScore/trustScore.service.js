import mongoose from 'mongoose';
import Profile from '../models/Profile.js';
import TrustScore from '../models/TrustScore.js';
import RiskSignal from '../models/RiskSignal.js';
import Engagement from '../models/Engagement.js';
import { NotFoundError } from '../lib/errors.js';
import { TrustScoreResponseSchema, TrustScoreBatchResponseSchema } from '@canary/shared';
import { MIN_ENGAGEMENTS_FOR_SCORING } from './scoringConfig.js';
import { bandForScore, strengthForSignal } from './bands.js';

export function viewerRelation(profile, identityId) {
  if (!identityId) return 'anonymous';
  return String(profile.identityId) === String(identityId) ? 'self' : 'member';
}

export function projectSignals(signals) {
  const structured = signals.filter((signal) => signal.source === 'structured-data');
  const total = structured.reduce((sum, signal) => sum + Math.abs(signal.value), 0);
  return structured
    .map((signal) => ({
      name: signal.name,
      direction: signal.direction,
      strength: strengthForSignal(signal.value, total),
      magnitude: Math.abs(signal.value),
    }))
    .sort((a, b) => b.magnitude - a.magnitude || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(({ magnitude, ...signal }) => signal);
}

export function projectTrustScore({ profile, snapshot, counts, signals, identityId }) {
  const profileId = String(profile._id);
  if (counts.currentOutcomeCount < MIN_ENGAGEMENTS_FOR_SCORING) {
    return {
      status: 'insufficient-history',
      profileId,
      outcomeCount: counts.currentOutcomeCount,
      outcomesNeeded: MIN_ENGAGEMENTS_FOR_SCORING,
    };
  }
  // A snapshot that scored nothing has no score to band. Reachable when outcomes land
  // after the last batch run: the recount above qualifies while the stored snapshot is
  // still the cold-start one.
  if (
    !snapshot ||
    snapshot.status !== 'scored' ||
    counts.snapshotOutcomeCount < MIN_ENGAGEMENTS_FOR_SCORING
  ) {
    return { status: 'pending-score', profileId, outcomeCount: counts.currentOutcomeCount };
  }
  const result = {
    status: counts.outcomesSince > 0 ? 'stale' : 'scored',
    profileId,
    band: bandForScore(snapshot.score),
    score: snapshot.score,
    generatedAt: new Date(snapshot.generatedAt).toISOString(),
    ...(counts.outcomesSince > 0 ? { outcomesSince: counts.outcomesSince } : {}),
  };
  // This public projection exposes only the safe explanation contract, regardless of whether the
  // authenticated viewer owns the Profile or is evaluating a counterparty.
  if (viewerRelation(profile, identityId) !== 'anonymous') result.signals = projectSignals(signals);
  return result;
}

async function latestSnapshots(profileIds) {
  const ids = profileIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await TrustScore.aggregate([
    { $match: { profileId: { $in: ids } } },
    { $sort: { generatedAt: -1, _id: -1 } },
    { $group: { _id: '$profileId', snapshot: { $first: '$$ROOT' } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.snapshot]));
}

// One aggregate proves all three facts: the Engagement is concluded, belongs to the Profile,
// and its Outcome describes that Profile. Counts are calculated in JS against each selected snapshot timestamp.
export async function outcomeRows(profileIds) {
  const ids = profileIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await Engagement.aggregate([
    {
      $match: {
        status: 'concluded',
        $or: [{ freelancerProfileId: { $in: ids } }, { clientProfileId: { $in: ids } }],
      },
    },
    {
      $lookup: { from: 'outcomes', localField: '_id', foreignField: 'engagementId', as: 'outcome' },
    },
    { $unwind: '$outcome' },
    {
      $project: {
        engagementId: '$_id',
        outcomeId: '$outcome._id',
        recordedAt: '$outcome.recordedAt',
        subjectProfileId: '$outcome.subjectProfileId',
        profileIds: {
          $filter: {
            input: ['$freelancerProfileId', '$clientProfileId'],
            as: 'profileId',
            cond: { $in: ['$$profileId', ids] },
          },
        },
      },
    },
    { $unwind: '$profileIds' },
    {
      $match: { $expr: { $eq: ['$subjectProfileId', '$profileIds'] } },
    },
    {
      $group: {
        _id: '$profileIds',
        outcomes: {
          $push: {
            outcomeId: '$outcomeId',
            subjectProfileId: '$subjectProfileId',
            recordedAt: '$recordedAt',
          },
        },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.outcomes]));
}

function countsFor(outcomes, snapshot) {
  const currentOutcomeCount = outcomes.length;
  if (!snapshot) return { currentOutcomeCount, snapshotOutcomeCount: 0, outcomesSince: 0 };
  const generatedAt = new Date(snapshot.generatedAt).getTime();
  const outcomesSince = outcomes.filter(
    (outcome) => new Date(outcome.recordedAt).getTime() > generatedAt,
  ).length;
  return {
    currentOutcomeCount,
    snapshotOutcomeCount: currentOutcomeCount - outcomesSince,
    outcomesSince,
  };
}

async function signalsFor(snapshots) {
  const ids = snapshots.map((snapshot) => snapshot._id);
  if (!ids.length) return new Map();
  const signals = await RiskSignal.find({
    parentType: 'TrustScore',
    source: 'structured-data',
    parentId: { $in: ids },
  }).lean();
  const grouped = new Map(ids.map((id) => [String(id), []]));
  for (const signal of signals) grouped.get(String(signal.parentId))?.push(signal);
  return grouped;
}

export async function getTrustScores(profileIds, identityId) {
  const uniqueIds = [...new Set(profileIds)];
  const objectIds = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));
  const profiles = await Profile.find({ _id: { $in: objectIds } }).lean();
  const profilesById = new Map(profiles.map((profile) => [String(profile._id), profile]));
  const existingIds = profiles.map((profile) => String(profile._id));
  const snapshotsByProfile = await latestSnapshots(existingIds);
  const rowsByProfile = await outcomeRows(existingIds);
  const eligibleSnapshots = [...snapshotsByProfile.entries()]
    .filter(([profileId, snapshot]) => {
      const counts = countsFor(rowsByProfile.get(profileId) ?? [], snapshot);
      return (
        counts.currentOutcomeCount >= MIN_ENGAGEMENTS_FOR_SCORING &&
        counts.snapshotOutcomeCount >= MIN_ENGAGEMENTS_FOR_SCORING
      );
    })
    .map(([, snapshot]) => snapshot);
  const signalsBySnapshot = await signalsFor(eligibleSnapshots);

  const byId = new Map();
  for (const id of existingIds) {
    const profile = profilesById.get(id);
    const relation = viewerRelation(profile, identityId);
    if (relation === 'member' && !profile.discoverable) {
      byId.set(id, { status: 'not-found', profileId: id });
      continue;
    }
    const snapshot = snapshotsByProfile.get(id);
    const counts = countsFor(rowsByProfile.get(id) ?? [], snapshot);
    const eligible =
      snapshot &&
      counts.currentOutcomeCount >= MIN_ENGAGEMENTS_FOR_SCORING &&
      counts.snapshotOutcomeCount >= MIN_ENGAGEMENTS_FOR_SCORING;
    const signals = snapshot ? (signalsBySnapshot.get(String(snapshot._id)) ?? []) : [];
    if (eligible && signals.length === 0) throw new Error('TrustScore signals are unavailable');
    byId.set(
      id,
      TrustScoreResponseSchema.parse(
        projectTrustScore({ profile, snapshot, counts, signals, identityId }),
      ),
    );
  }
  return uniqueIds.map((id) => byId.get(id) ?? { status: 'not-found', profileId: id });
}

export async function getTrustScore(profileId, identityId) {
  const [result] = await getTrustScores([profileId], identityId);
  if (result.status === 'not-found') throw new NotFoundError('Profile', profileId);
  return result;
}

export async function getTrustScoreBatch(profileIds, identityId) {
  return TrustScoreBatchResponseSchema.parse({
    data: await getTrustScores(profileIds, identityId),
  });
}
