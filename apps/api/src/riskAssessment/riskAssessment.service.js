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

export async function requestProposalRiskAssessment(
  proposalId,
  activeProfileId,
  { recompute = false } = {},
) {
  const proposal = await Proposal.findById(proposalId);
  if (!proposal) throw new NotFoundError('Proposal', proposalId);
  const jobPost = await JobPost.findById(proposal.jobPostId);
  if (!jobPost) throw new NotFoundError('JobPost', proposal.jobPostId);

  const partyIds = [jobPost.clientProfileId.toString(), proposal.freelancerProfileId.toString()];
  if (!partyIds.includes(activeProfileId.toString())) {
    throw new ForbiddenError('Only a Proposal Party may request its RiskAssessment');
  }
  if (!['submitted', 'shortlisted'].includes(proposal.status)) {
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
    engagement.agreedTerms = proposedTerms(jobPost, proposal);
    await engagement.save();
    return { engagement, riskAssessment: matching, riskAssessmentStatus: 'current' };
  }
  if (latest && latest.inputVersion !== result.inputVersion && !recompute) {
    return { engagement, riskAssessment: latest, riskAssessmentStatus: 'stale' };
  }
  const riskAssessment = await createOrReuseAssessment(engagement, result);

  if (!latest || latest.inputVersion !== result.inputVersion) {
    engagement.agreedTerms = proposedTerms(jobPost, proposal);
    await engagement.save();
  }
  return { engagement, riskAssessment, riskAssessmentStatus: 'current' };
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
