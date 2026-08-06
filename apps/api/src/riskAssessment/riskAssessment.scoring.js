import { createHash } from 'node:crypto';

export const RISK_MODEL_VERSION = 'risk-deterministic-v1';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function createRiskInputVersion(input) {
  const payload = JSON.stringify(canonicalize(input));
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

export function classifyRisk(score) {
  if (score <= 34) return { level: 'low', verdict: 'proceed' };
  if (score <= 64) return { level: 'med', verdict: 'caution' };
  return { level: 'high', verdict: 'avoid' };
}

function signal(name, value, direction, label, evidence) {
  return { name, value, direction, source: 'structured-data', label, evidence };
}

function standingContribution(trustScores) {
  const parties = [trustScores?.client, trustScores?.freelancer];
  const scored = parties.filter(
    (standing) => ['scored', 'stale'].includes(standing?.status) && Number.isFinite(standing.score),
  );
  const missingCount = parties.length - scored.length;
  const scores = parties.map((standing) =>
    ['scored', 'stale'].includes(standing?.status) && Number.isFinite(standing.score)
      ? standing.score
      : 50,
  );
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const risk = scores.reduce((sum, score) => sum + (100 - score) * 0.2, 0);
  const signals = [];
  const safeEvidenceNames = [
    ...new Set(scored.flatMap((standing) => standing.signals ?? []).map((item) => item.name)),
  ].sort();
  const safeEvidence =
    safeEvidenceNames.length > 0
      ? ` Safe TrustScore evidence: ${safeEvidenceNames.slice(0, 5).join(', ')}.`
      : '';

  if (missingCount > 0) {
    signals.push(
      signal(
        'STANDING_HISTORY_MISSING',
        0,
        'unfavorable',
        'Standing history is limited',
        `${missingCount} Party ${missingCount === 1 ? 'has' : 'Profiles have'} insufficient TrustScore history; confidence is reduced without adding risk.`,
      ),
    );
  }
  if (scored.length > 0 && average >= 70) {
    signals.push(
      signal(
        'PARTY_STANDING_STRONG',
        Number(((average - 50) / 50).toFixed(3)),
        'favorable',
        'Party standing is strong',
        `Available Party TrustScores average ${Math.round(average)} out of 100.${safeEvidence}`,
      ),
    );
  } else if (scored.length > 0 && average < 50) {
    signals.push(
      signal(
        'PARTY_STANDING_CONCERN',
        Number(((50 - average) / 50).toFixed(3)),
        'unfavorable',
        'Party standing needs caution',
        `Available Party TrustScores average ${Math.round(average)} out of 100.${safeEvidence}`,
      ),
    );
  }
  return { risk, missingCount, signals, safeEvidenceNames };
}

function priceContribution(jobPost, proposal) {
  const ratio = proposal.bid / jobPost.budgetOrRate;
  let risk = 0;
  if (ratio > 1) {
    risk = ratio <= 1.25 ? ((ratio - 1) / 0.25) * 10 : 10 + ((ratio - 1.25) / 0.75) * 10;
  }
  risk = clamp(risk, 0, 20);
  if (ratio <= 1.05) {
    return {
      risk,
      signals: [
        signal(
          'PRICE_ALIGNED',
          Number((1 - Math.min(1, ratio)).toFixed(3)),
          'favorable',
          'Price fits the JobPost',
          `The proposed amount is ${Math.round(ratio * 100)}% of the stated budget or rate.`,
        ),
      ],
    };
  }
  return {
    risk,
    signals: [
      signal(
        'PRICE_EXCEEDS_BUDGET',
        Number((ratio - 1).toFixed(3)),
        'unfavorable',
        'Price exceeds the JobPost',
        `The proposed amount is ${Math.round(ratio * 100)}% of the stated budget or rate.`,
      ),
    ],
  };
}

function scopeContribution(jobPost) {
  const shortDescription = (jobPost.description?.trim().length ?? 0) < 120;
  const fewSkills = (jobPost.skills?.length ?? 0) < 2;
  const noScreeningContext = (jobPost.screeningQuestions?.length ?? 0) === 0;
  const risk = (shortDescription ? 7 : 0) + (fewSkills ? 4 : 0) + (noScreeningContext ? 4 : 0);
  if (risk === 0) {
    return {
      risk,
      signals: [
        signal(
          'CLEAR_SCOPE',
          1,
          'favorable',
          'Scope is specific',
          'The JobPost includes a detailed description, named skills, and screening context.',
        ),
      ],
    };
  }
  const gaps = [
    shortDescription && 'brief description',
    fewSkills && 'limited skill detail',
    noScreeningContext && 'no screening context',
  ].filter(Boolean);
  return {
    risk,
    signals: [
      signal(
        'SCOPE_UNCERTAINTY',
        Number((risk / 15).toFixed(3)),
        'unfavorable',
        'Scope needs clarification',
        `Structured scope gaps: ${gaps.join(', ')}.`,
      ),
    ],
  };
}

const projectLengthDays = {
  'less-than-1-month': 30,
  '1-to-3-months': 90,
  '3-to-6-months': 180,
  'more-than-6-months': 365,
};

function scheduleContribution(jobPost, proposal) {
  const expectedMax = projectLengthDays[jobPost.projectLength] ?? 365;
  const durationRatio = proposal.proposedDurationDays / expectedMax;
  const durationRisk = durationRatio > 1 ? clamp((durationRatio - 1) * 10, 0, 10) : 0;
  const workloadMissing = jobPost.jobType === 'hourly' && !jobPost.hoursPerWeek;
  const risk = durationRisk + (workloadMissing ? 5 : 0);
  if (risk === 0) {
    return {
      risk,
      signals: [
        signal(
          'SCHEDULE_CLEAR',
          1,
          'favorable',
          'Schedule is defined',
          `The Proposal specifies ${proposal.proposedDurationDays} days within the JobPost horizon.`,
        ),
      ],
    };
  }
  return {
    risk,
    signals: [
      signal(
        'SCHEDULE_UNCERTAINTY',
        Number((risk / 15).toFixed(3)),
        'unfavorable',
        'Schedule needs review',
        workloadMissing
          ? 'The hourly JobPost has no hours-per-week expectation or the proposed duration exceeds its horizon.'
          : `The proposed ${proposal.proposedDurationDays} days exceeds the JobPost horizon.`,
      ),
    ],
  };
}

function paymentContribution(proposal) {
  if (proposal.payModel !== 'milestone') {
    return {
      risk: 0,
      signals: [
        signal(
          'PAYMENT_STRUCTURE_CLEAR',
          1,
          'favorable',
          'Payment structure is defined',
          'The Proposal uses a single fixed payment amount.',
        ),
      ],
    };
  }
  const milestones = proposal.proposedMilestones ?? [];
  const total = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  const mismatch = proposal.bid > 0 ? Math.abs(total - proposal.bid) / proposal.bid : 1;
  const risk = milestones.length === 0 ? 10 : clamp(mismatch * 10, 0, 10);
  if (risk <= 0.01) {
    return {
      risk: 0,
      signals: [
        signal(
          'PAYMENT_STRUCTURE_CLEAR',
          1,
          'favorable',
          'Milestones match the Proposal',
          `${milestones.length} milestone amounts total the proposed price.`,
        ),
      ],
    };
  }
  return {
    risk,
    signals: [
      signal(
        'PAYMENT_STRUCTURE_UNCERTAINTY',
        Number(clamp(mismatch, 0, 1).toFixed(3)),
        'unfavorable',
        'Milestones do not match the Proposal',
        milestones.length === 0
          ? 'Milestone payment was selected without milestones.'
          : `Milestones total ${total}, while the Proposal amount is ${proposal.bid}.`,
      ),
    ],
  };
}

function explanationFor(verdict, signals, safeEvidenceNames) {
  const warningLabels = signals
    .filter((item) => item.direction === 'unfavorable' && item.value > 0)
    .map((item) => item.label.toLowerCase());
  const decisionExplanation =
    warningLabels.length === 0
      ? 'Structured terms and available Party standing support proceeding, with normal human review.'
      : `Decision support recommends ${verdict}: ${warningLabels.slice(0, 3).join('; ')}.`;
  const standingEvidence =
    safeEvidenceNames.length > 0
      ? ` TrustScore evidence considered: ${safeEvidenceNames.slice(0, 5).join(', ')}.`
      : '';
  return `${decisionExplanation}${standingEvidence}`;
}

export function assessRisk(input) {
  const standing = standingContribution(input.trustScores);
  const contributions = [
    standing,
    priceContribution(input.jobPost, input.proposal),
    scopeContribution(input.jobPost),
    scheduleContribution(input.jobPost, input.proposal),
    paymentContribution(input.proposal),
  ];
  const score = Math.round(
    clamp(
      contributions.reduce((sum, contribution) => sum + contribution.risk, 0),
      0,
      100,
    ),
  );
  const signals = contributions.flatMap((contribution) => contribution.signals);
  const screeningGap =
    (input.jobPost.screeningQuestions?.length ?? 0) >
    (input.proposal.screeningAnswers?.length ?? 0);
  const workloadGap = input.jobPost.jobType === 'hourly' && !input.jobPost.hoursPerWeek;
  const confidence = Number(
    clamp(
      1 - standing.missingCount * 0.2 - (screeningGap ? 0.05 : 0) - (workloadGap ? 0.05 : 0),
      0.4,
      1,
    ).toFixed(2),
  );
  const classification = classifyRisk(score);

  return {
    score,
    ...classification,
    confidence,
    explanation: explanationFor(classification.verdict, signals, standing.safeEvidenceNames),
    signals,
    inputVersion: createRiskInputVersion(input),
    modelVersion: RISK_MODEL_VERSION,
  };
}
