import Engagement from '../models/Engagement.js';
import JobPost from '../models/JobPost.js';
import Profile from '../models/Profile.js';
import RiskAssessment from '../models/RiskAssessment.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import {
  ensureSignals,
  loadCurrentTrustScores,
  scoringInput,
  toRiskAssessmentSummaryContract,
} from './riskAssessment.service.js';
import { assessRisk, projectLengthDays } from './riskAssessment.scoring.js';

// No Proposal exists yet, so there is no bid/payment-model/duration to score against. The
// preview scores the JobPost's own stated terms as a single-fixed-payment baseline proposal —
// "if a Freelancer proposed roughly at the listed terms". This deliberately reuses assessRisk
// unmodified rather than forking a JobPost-only scoring path, so the preview inherits the exact
// same idempotency/recompute-on-change behaviour as the post-Proposal assessment for free.
function impliedProposalFromJobPost(jobPost, freelancerProfileId) {
  return {
    // scoringInput() reads proposal._id and proposal.freelancerProfileId — reusing the
    // Freelancer's own id for both keeps the input (and its hash) stable across calls, which
    // idempotency and recompute-on-change depend on. No real Proposal exists yet, so there is no
    // separate proposal id to use.
    _id: freelancerProfileId,
    freelancerProfileId,
    bid: jobPost.budgetOrRate,
    payModel: 'project',
    proposedMilestones: [],
    proposedDurationDays: projectLengthDays[jobPost.projectLength] ?? 365,
    screeningAnswers: [],
  };
}

async function findOrCreatePreviewEngagement(jobPost, freelancerProfileId) {
  const fields = {
    freelancerProfileId,
    clientProfileId: jobPost.clientProfileId,
    jobPostId: jobPost._id,
    proposalId: null,
    status: 'prospective',
  };
  try {
    return await Engagement.findOneAndUpdate(
      { freelancerProfileId, jobPostId: jobPost._id, proposalId: null },
      { $setOnInsert: fields },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return Engagement.findOne({ freelancerProfileId, jobPostId: jobPost._id, proposalId: null });
  }
}

async function createOrReusePreviewAssessment(engagement, result) {
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

export async function requestJobPostRiskPreview(
  jobPostId,
  activeProfile,
  { recompute = false } = {},
) {
  if (activeProfile?.role !== 'freelancer') {
    throw new ForbiddenError('Only an active Freelancer Profile may request a risk preview');
  }
  const jobPost = await JobPost.findById(jobPostId);
  if (!jobPost) throw new NotFoundError('JobPost', jobPostId);
  if (jobPost.status !== 'open') {
    throw new BadRequestError('RiskAssessment preview requires an open JobPost');
  }
  const freelancerProfile = await Profile.findOne({
    _id: activeProfile.id,
    role: 'freelancer',
  }).lean();
  if (!freelancerProfile) throw new NotFoundError('Freelancer Profile', activeProfile.id);

  const engagement = await findOrCreatePreviewEngagement(jobPost, freelancerProfile._id);
  const latest = await RiskAssessment.findOne({ engagementId: engagement._id }).sort({
    generatedAt: -1,
    _id: -1,
  });

  const trustByProfileId = await loadCurrentTrustScores(
    [jobPost.clientProfileId, freelancerProfile._id],
    freelancerProfile.identityId,
  );
  const input = scoringInput(
    jobPost,
    impliedProposalFromJobPost(jobPost, freelancerProfile._id),
    trustByProfileId,
  );
  const result = assessRisk(input);

  const matching = await RiskAssessment.findOne({
    engagementId: engagement._id,
    inputVersion: result.inputVersion,
  });
  if (matching) {
    await ensureSignals(matching._id, result.signals);
    return { engagement, riskAssessment: matching, riskAssessmentStatus: 'current' };
  }
  if (latest && latest.inputVersion !== result.inputVersion && !recompute) {
    return { engagement, riskAssessment: latest, riskAssessmentStatus: 'stale' };
  }
  const riskAssessment = await createOrReusePreviewAssessment(engagement, result);
  return { engagement, riskAssessment, riskAssessmentStatus: 'current' };
}

function toPreviewEngagementContract(engagement) {
  return {
    id: engagement._id.toString(),
    status: engagement.status,
    freelancerProfileId: engagement.freelancerProfileId.toString(),
    clientProfileId: engagement.clientProfileId.toString(),
    jobPostId: engagement.jobPostId.toString(),
    createdAt: new Date(engagement.createdAt).toISOString(),
  };
}

export async function toRiskPreviewContract(result) {
  return {
    engagement: toPreviewEngagementContract(result.engagement),
    riskAssessment: await toRiskAssessmentSummaryContract(
      result.riskAssessment,
      result.riskAssessmentStatus,
    ),
  };
}
