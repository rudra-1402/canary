import Engagement from '../models/Engagement.js';
import JobPost from '../models/JobPost.js';
import Profile from '../models/Profile.js';
import Proposal from '../models/Proposal.js';
import RiskAssessment from '../models/RiskAssessment.js';
import RiskSignal from '../models/RiskSignal.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  RiskAssessmentNotFoundError,
} from '../lib/errors.js';
import { toEngagementCommandContract } from '../engagement/engagement.serializer.js';
import { getTrustScores } from '../trustScore/trustScore.service.js';
import { assessRisk } from './riskAssessment.scoring.js';

function proposedTerms(jobPost, proposal) {
  return {
    scope: jobPost.description,
    price: proposal.bid,
    paymentTerms: proposal.payModel,
    timeline: proposal.durationEstimate || `${proposal.proposedDurationDays} days`,
    revisionsIncluded: 0,
    jobPostBudgetOrRate: jobPost.budgetOrRate,
    jobType: jobPost.jobType,
    skills: jobPost.skills ?? [],
    projectLength: jobPost.projectLength,
    hoursPerWeek: jobPost.hoursPerWeek ?? null,
    proposedDurationDays: proposal.proposedDurationDays,
    proposedMilestones: (proposal.proposedMilestones ?? []).map((milestone) => ({
      description: milestone.description,
      amount: milestone.amount,
    })),
    screeningQuestions: jobPost.screeningQuestions ?? [],
    screeningAnswers: proposal.screeningAnswers ?? [],
  };
}

function refreshedTerms(engagement, jobPost, proposal) {
  return {
    ...proposedTerms(jobPost, proposal),
    ...(engagement.agreedTerms?.dueAt ? { dueAt: engagement.agreedTerms.dueAt } : {}),
  };
}

async function refreshEngagementTerms(engagement, jobPost, proposal) {
  if (engagement.status !== 'prospective' && !engagement.agreedTerms?.dueAt) return engagement;
  engagement.agreedTerms = refreshedTerms(engagement, jobPost, proposal);
  await engagement.save();
  return engagement;
}

async function findOrCreateEngagement(jobPost, proposal) {
  const fields = {
    freelancerProfileId: proposal.freelancerProfileId,
    clientProfileId: jobPost.clientProfileId,
    jobPostId: jobPost._id,
    proposalId: proposal._id,
    status: 'prospective',
    agreedTerms: proposedTerms(jobPost, proposal),
  };
  try {
    return await Engagement.findOneAndUpdate(
      { proposalId: proposal._id },
      { $setOnInsert: fields },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
  } catch (error) {
    if (error?.code === 11000) return Engagement.findOne({ proposalId: proposal._id });
    throw error;
  }
}

function toStandingInput(state) {
  const standing = {
    status: state.status,
    ...(state.outcomeCount !== undefined ? { outcomeCount: state.outcomeCount } : {}),
    ...(state.outcomesNeeded !== undefined ? { outcomesNeeded: state.outcomesNeeded } : {}),
  };
  if (!['scored', 'stale'].includes(state.status)) return standing;
  return {
    ...standing,
    score: state.score,
    generatedAt: state.generatedAt,
    ...(state.outcomesSince !== undefined ? { outcomesSince: state.outcomesSince } : {}),
    signals: [...(state.signals ?? [])].sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.direction.localeCompare(right.direction),
    ),
  };
}

function scoringInput(jobPost, proposal, trustByProfileId) {
  return {
    jobPost: {
      id: jobPost._id.toString(),
      clientProfileId: jobPost.clientProfileId.toString(),
      description: jobPost.description,
      skills: jobPost.skills ?? [],
      jobType: jobPost.jobType,
      budgetOrRate: jobPost.budgetOrRate,
      projectLength: jobPost.projectLength,
      hoursPerWeek: jobPost.hoursPerWeek ?? null,
      screeningQuestions: jobPost.screeningQuestions ?? [],
    },
    proposal: {
      id: proposal._id.toString(),
      freelancerProfileId: proposal.freelancerProfileId.toString(),
      bid: proposal.bid,
      payModel: proposal.payModel,
      proposedMilestones: (proposal.proposedMilestones ?? []).map((milestone) => ({
        description: milestone.description,
        amount: milestone.amount,
      })),
      proposedDurationDays: proposal.proposedDurationDays,
      screeningAnswers: proposal.screeningAnswers ?? [],
    },
    trustScores: {
      client: toStandingInput(trustByProfileId.get(jobPost.clientProfileId.toString())),
      freelancer: toStandingInput(trustByProfileId.get(proposal.freelancerProfileId.toString())),
    },
  };
}

async function loadCurrentTrustScores(profileIds, identityId) {
  const ids = profileIds.map(String);
  const states = await getTrustScores(ids, identityId, { visibilityGrantedProfileIds: ids });
  return new Map(states.map((state) => [state.profileId, state]));
}

async function ensureSignals(assessmentId, signals) {
  if (signals.length === 0) return;
  await RiskSignal.bulkWrite(
    signals.map((item) => ({
      updateOne: {
        filter: {
          parentType: 'RiskAssessment',
          parentId: assessmentId,
          name: item.name,
          source: item.source,
        },
        update: {
          $set: {
            value: item.value,
            direction: item.direction,
            label: item.label,
            evidence: item.evidence,
          },
          $setOnInsert: {
            parentType: 'RiskAssessment',
            parentId: assessmentId,
            name: item.name,
            source: item.source,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function createOrReuseAssessment(engagement, result) {
  let assessment = await RiskAssessment.findOne({
    engagementId: engagement._id,
    inputVersion: result.inputVersion,
  });
  if (!assessment) {
    try {
      assessment = await RiskAssessment.create({
        engagementId: engagement._id,
        score: result.score,
        level: result.level,
        verdict: result.verdict,
        confidence: result.confidence,
        explanation: result.explanation,
        inputVersion: result.inputVersion,
        modelVersion: result.modelVersion,
        generatedAt: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      assessment = await RiskAssessment.findOne({
        engagementId: engagement._id,
        inputVersion: result.inputVersion,
      });
    }
  }
  await ensureSignals(assessment._id, result.signals);
  return assessment;
}

async function assertLinkedProfiles(jobPost, proposal) {
  const [client, freelancer] = await Promise.all([
    Profile.findOne({ _id: jobPost.clientProfileId, role: 'client' }).lean(),
    Profile.findOne({ _id: proposal.freelancerProfileId, role: 'freelancer' }).lean(),
  ]);
  if (!client) throw new NotFoundError('Client Profile', jobPost.clientProfileId);
  if (!freelancer) throw new NotFoundError('Freelancer Profile', proposal.freelancerProfileId);
  return { client, freelancer };
}

async function calculateProposalRiskAssessment(
  proposalId,
  activeProfileId,
  { recompute, allowedProposalStatuses },
) {
  const proposal = await Proposal.findById(proposalId);
  if (!proposal) throw new NotFoundError('Proposal', proposalId);
  const jobPost = await JobPost.findById(proposal.jobPostId);
  if (!jobPost) throw new NotFoundError('JobPost', proposal.jobPostId);

  const partyIds = [jobPost.clientProfileId.toString(), proposal.freelancerProfileId.toString()];
  if (!partyIds.includes(activeProfileId.toString())) {
    throw new ForbiddenError('Only a Proposal Party may request its RiskAssessment');
  }
  if (!allowedProposalStatuses.includes(proposal.status)) {
    throw new BadRequestError('RiskAssessment requires a submitted Proposal');
  }
  const linkedProfiles = await assertLinkedProfiles(jobPost, proposal);
  const requestingProfile = [linkedProfiles.client, linkedProfiles.freelancer].find(
    (profile) => profile._id.toString() === activeProfileId.toString(),
  );

  const engagement = await findOrCreateEngagement(jobPost, proposal);
  const latest = await RiskAssessment.findOne({ engagementId: engagement._id }).sort({
    generatedAt: -1,
    _id: -1,
  });

  const trustByProfileId = await loadCurrentTrustScores(
    [jobPost.clientProfileId, proposal.freelancerProfileId],
    requestingProfile.identityId,
  );
  const result = assessRisk(scoringInput(jobPost, proposal, trustByProfileId));
  const matching = await RiskAssessment.findOne({
    engagementId: engagement._id,
    inputVersion: result.inputVersion,
  });
  if (matching) {
    await ensureSignals(matching._id, result.signals);
    await refreshEngagementTerms(engagement, jobPost, proposal);
    return { engagement, riskAssessment: matching, riskAssessmentStatus: 'current' };
  }
  if (latest && latest.inputVersion !== result.inputVersion && !recompute) {
    return { engagement, riskAssessment: latest, riskAssessmentStatus: 'stale' };
  }
  const riskAssessment = await createOrReuseAssessment(engagement, result);

  if (!latest || latest.inputVersion !== result.inputVersion) {
    await refreshEngagementTerms(engagement, jobPost, proposal);
  }
  return { engagement, riskAssessment, riskAssessmentStatus: 'current' };
}

export async function requestProposalRiskAssessment(
  proposalId,
  activeProfileId,
  { recompute = false } = {},
) {
  return calculateProposalRiskAssessment(proposalId, activeProfileId, {
    recompute,
    allowedProposalStatuses: ['submitted', 'shortlisted'],
  });
}

export async function ensureCurrentProposalRiskAssessmentForAcceptance(
  proposalId,
  activeProfileId,
) {
  return calculateProposalRiskAssessment(proposalId, activeProfileId, {
    recompute: true,
    allowedProposalStatuses: ['submitted', 'shortlisted', 'accepted'],
  });
}

export async function getAssessmentSignals(assessmentId) {
  return RiskSignal.find({
    parentType: 'RiskAssessment',
    parentId: assessmentId,
    source: 'structured-data',
  })
    .sort({ direction: 1, name: 1, _id: 1 })
    .lean();
}

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

export async function toRiskAssessmentSummaryContract(assessment, status) {
  const signals = await getAssessmentSignals(assessment._id);
  return toRiskAssessmentSummaryWithSignals(assessment, status, signals);
}

function toRiskAssessmentSummaryWithSignals(assessment, status, signals) {
  return {
    id: assessment._id.toString(),
    engagementId: assessment.engagementId.toString(),
    status,
    score: assessment.score,
    level: assessment.level,
    verdict: assessment.verdict,
    confidence: assessment.confidence,
    explanation: assessment.explanation ?? '',
    signals: signals.map((item) => ({
      code: item.name,
      severity: item.direction === 'favorable' ? 'positive' : 'warning',
      label: item.label,
      evidence: item.evidence,
    })),
    generatedAt: iso(assessment.generatedAt),
    inputVersion: assessment.inputVersion,
    modelVersion: assessment.modelVersion,
  };
}

export async function findRiskAssessmentSummariesForEngagements(
  engagements,
  activeProfileId,
  viewerIdentityId,
) {
  if (engagements.length === 0) return new Map();
  for (const engagement of engagements) {
    const partyIds = [String(engagement.clientProfileId), String(engagement.freelancerProfileId)];
    if (!partyIds.includes(String(activeProfileId))) {
      throw new ForbiddenError('Only an Engagement Party may read its RiskAssessment');
    }
  }

  const [jobPosts, proposals] = await Promise.all([
    JobPost.find({ _id: { $in: engagements.map((item) => item.jobPostId) } }).lean(),
    Proposal.find({ _id: { $in: engagements.map((item) => item.proposalId) } }).lean(),
  ]);
  const jobPostsById = new Map(jobPosts.map((item) => [String(item._id), item]));
  const proposalsById = new Map(proposals.map((item) => [String(item._id), item]));
  const profileIds = [
    ...new Set(
      engagements.flatMap((item) => [
        String(item.clientProfileId),
        String(item.freelancerProfileId),
      ]),
    ),
  ];
  const trustByProfileId = await loadCurrentTrustScores(profileIds, viewerIdentityId);
  const currentVersions = new Map();
  for (const engagement of engagements) {
    const jobPost = jobPostsById.get(String(engagement.jobPostId));
    const proposal = proposalsById.get(String(engagement.proposalId));
    if (!jobPost || !proposal) throw new Error('RiskAssessment linked data is unavailable');
    currentVersions.set(
      String(engagement._id),
      assessRisk(scoringInput(jobPost, proposal, trustByProfileId)).inputVersion,
    );
  }

  const engagementIds = engagements.map((item) => item._id);
  const [matching, latestRows] = await Promise.all([
    RiskAssessment.find({
      $or: engagements.map((item) => ({
        engagementId: item._id,
        inputVersion: currentVersions.get(String(item._id)),
      })),
    }).lean(),
    RiskAssessment.aggregate([
      { $match: { engagementId: { $in: engagementIds } } },
      { $sort: { generatedAt: -1, _id: -1 } },
      { $group: { _id: '$engagementId', assessment: { $first: '$$ROOT' } } },
    ]),
  ]);
  const matchingByEngagement = new Map(matching.map((item) => [String(item.engagementId), item]));
  const latestByEngagement = new Map(latestRows.map((item) => [String(item._id), item.assessment]));
  const selected = engagements
    .map((item) => {
      const id = String(item._id);
      const current = matchingByEngagement.get(id);
      const assessment = current ?? latestByEngagement.get(id);
      return assessment
        ? { engagementId: id, assessment, status: current ? 'current' : 'stale' }
        : null;
    })
    .filter(Boolean);
  const signals = await RiskSignal.find({
    parentType: 'RiskAssessment',
    parentId: { $in: selected.map((item) => item.assessment._id) },
    source: 'structured-data',
  })
    .sort({ direction: 1, name: 1, _id: 1 })
    .lean();
  const signalsByAssessment = new Map();
  for (const item of signals) {
    const id = String(item.parentId);
    if (!signalsByAssessment.has(id)) signalsByAssessment.set(id, []);
    signalsByAssessment.get(id).push(item);
  }
  return new Map(
    selected.map((item) => [
      item.engagementId,
      toRiskAssessmentSummaryWithSignals(
        item.assessment,
        item.status,
        signalsByAssessment.get(String(item.assessment._id)) ?? [],
      ),
    ]),
  );
}

export async function toRiskAssessmentCommandContract(result) {
  return {
    engagement: toEngagementCommandContract(result.engagement),
    riskAssessment: await toRiskAssessmentSummaryContract(
      result.riskAssessment,
      result.riskAssessmentStatus,
    ),
  };
}

async function currentInputVersionForEngagement(engagement, activeProfileId) {
  const [jobPost, proposal, requestingProfile] = await Promise.all([
    JobPost.findById(engagement.jobPostId),
    Proposal.findById(engagement.proposalId),
    Profile.findById(activeProfileId).select('identityId').lean(),
  ]);
  if (!jobPost) throw new NotFoundError('JobPost', engagement.jobPostId);
  if (!proposal) throw new NotFoundError('Proposal', engagement.proposalId);
  if (!requestingProfile) throw new NotFoundError('Profile', activeProfileId);
  const trustByProfileId = await loadCurrentTrustScores(
    [jobPost.clientProfileId, proposal.freelancerProfileId],
    requestingProfile.identityId,
  );
  return assessRisk(scoringInput(jobPost, proposal, trustByProfileId)).inputVersion;
}

export async function findRiskAssessmentForEngagement(engagement, activeProfileId) {
  const partyIds = [
    engagement.clientProfileId.toString(),
    engagement.freelancerProfileId.toString(),
  ];
  if (!partyIds.includes(activeProfileId.toString())) {
    throw new ForbiddenError('Only an Engagement Party may read its RiskAssessment');
  }
  const currentInputVersion = await currentInputVersionForEngagement(engagement, activeProfileId);
  const current = await RiskAssessment.findOne({
    engagementId: engagement._id,
    inputVersion: currentInputVersion,
  });
  if (current) return { assessment: current, status: 'current' };
  const latest = await RiskAssessment.findOne({ engagementId: engagement._id }).sort({
    generatedAt: -1,
    _id: -1,
  });
  return latest ? { assessment: latest, status: 'stale' } : null;
}

export async function findRiskAssessmentSummaryForEngagement(engagement, activeProfileId) {
  const result = await findRiskAssessmentForEngagement(engagement, activeProfileId);
  if (!result) return null;
  return toRiskAssessmentSummaryContract(result.assessment, result.status);
}

export async function getEngagementRiskAssessment(engagementId, activeProfileId) {
  const engagement = await Engagement.findById(engagementId);
  if (!engagement) throw new NotFoundError('Engagement', engagementId);
  const partyIds = [
    engagement.clientProfileId.toString(),
    engagement.freelancerProfileId.toString(),
  ];
  if (!partyIds.includes(activeProfileId.toString())) {
    throw new ForbiddenError('Only an Engagement Party may read its RiskAssessment');
  }
  const riskAssessment = await findRiskAssessmentSummaryForEngagement(engagement, activeProfileId);
  if (!riskAssessment) throw new RiskAssessmentNotFoundError();
  return riskAssessment;
}
