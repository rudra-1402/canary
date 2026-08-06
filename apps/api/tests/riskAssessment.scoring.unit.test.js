import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RISK_MODEL_VERSION,
  assessRisk,
  classifyRisk,
  createRiskInputVersion,
} from '../src/riskAssessment/riskAssessment.scoring.js';

const baseInput = () => ({
  jobPost: {
    id: '1'.repeat(24),
    clientProfileId: '2'.repeat(24),
    description:
      'Design and build an accessible analytics dashboard with five approved views, responsive behavior, documented empty states, and a final handoff.',
    skills: ['Figma', 'React', 'Accessibility'],
    jobType: 'fixed',
    budgetOrRate: 1200,
    projectLength: 'less-than-1-month',
    hoursPerWeek: null,
    screeningQuestions: ['Share one comparable dashboard project.'],
  },
  proposal: {
    id: '3'.repeat(24),
    freelancerProfileId: '4'.repeat(24),
    bid: 1150,
    payModel: 'project',
    proposedMilestones: [],
    proposedDurationDays: 14,
    screeningAnswers: ['A similar analytics dashboard is in my portfolio.'],
  },
  trustScores: {
    client: { status: 'scored', score: 88, generatedAt: '2026-08-05T00:00:00.000Z' },
    freelancer: { status: 'scored', score: 92, generatedAt: '2026-08-05T00:00:00.000Z' },
  },
});

describe('deterministic RiskAssessment scoring', () => {
  it('uses the canonical RiskSignal vocabulary in the scoring component', () => {
    const source = readFileSync(
      new URL('../src/riskAssessment/riskAssessment.scoring.js', import.meta.url),
      'utf8',
    );
    const forbiddenRiskSignalSynonym =
      /(?:(?:\b|_)(?:features?|factors?)(?=[A-Z0-9_$]|\b|_)|(?:Features?|Factors?)(?=[A-Z0-9_$]|\b|_)|(?:\b|_)(?:FEATURES?|FACTORS?)(?=_|\b))/;

    for (const forbiddenIdentifier of [
      'standingFeature',
      'priceFactor',
      'featureContribution',
      'factorWeight',
      'riskFeatureScore',
      'riskFactorWeight',
      'riskFeatures',
      'riskFactors',
      'Features',
      'Factors',
      'standing_feature',
      'factor_weight',
      'RISK_FEATURE_SCORE',
      'RISK_FACTOR_WEIGHT',
    ]) {
      expect(forbiddenIdentifier).toMatch(forbiddenRiskSignalSynonym);
    }
    expect('refactorAssessment').not.toMatch(forbiddenRiskSignalSynonym);
    expect(source).not.toMatch(forbiddenRiskSignalSynonym);
  });

  it.each([
    [0, 'low', 'proceed'],
    [34, 'low', 'proceed'],
    [35, 'med', 'caution'],
    [64, 'med', 'caution'],
    [65, 'high', 'avoid'],
    [100, 'high', 'avoid'],
  ])('maps score %i to %s/%s', (score, level, verdict) => {
    expect(classifyRisk(score)).toEqual({ level, verdict });
  });

  it('produces a low-risk result for aligned, complete terms and strong standing', () => {
    const result = assessRisk(baseInput());
    expect(result.modelVersion).toBe(RISK_MODEL_VERSION);
    expect(result.score).toBeLessThanOrEqual(34);
    expect(result.level).toBe('low');
    expect(result.verdict).toBe('proceed');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'CLEAR_SCOPE', direction: 'favorable' }),
        expect.objectContaining({ name: 'PRICE_ALIGNED', direction: 'favorable' }),
      ]),
    );
  });

  it('raises named risk for price, scope, schedule, payment, and weak standing', () => {
    const input = baseInput();
    input.jobPost.description = 'Need help.';
    input.jobPost.skills = [];
    input.jobPost.screeningQuestions = [];
    input.proposal.bid = 3000;
    input.proposal.payModel = 'milestone';
    input.proposal.proposedMilestones = [{ description: 'Only milestone', amount: 100 }];
    input.proposal.proposedDurationDays = 120;
    input.trustScores.client.score = 5;
    input.trustScores.freelancer.score = 10;

    const result = assessRisk(input);
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.level).toBe('high');
    expect(result.verdict).toBe('avoid');
    expect(result.signals.map((signal) => signal.name)).toEqual(
      expect.arrayContaining([
        'PARTY_STANDING_CONCERN',
        'PRICE_EXCEEDS_BUDGET',
        'SCOPE_UNCERTAINTY',
        'SCHEDULE_UNCERTAINTY',
        'PAYMENT_STRUCTURE_UNCERTAINTY',
      ]),
    );
  });

  it('treats missing TrustScore history as neutral risk but lower confidence', () => {
    const missing = baseInput();
    missing.trustScores = {
      client: { status: 'insufficient-history' },
      freelancer: { status: 'insufficient-history' },
    };
    const neutral = baseInput();
    neutral.trustScores.client.score = 50;
    neutral.trustScores.freelancer.score = 50;

    const missingResult = assessRisk(missing);
    const neutralResult = assessRisk(neutral);
    expect(missingResult.score).toBe(neutralResult.score);
    expect(missingResult.confidence).toBeLessThan(neutralResult.confidence);
    expect(missingResult.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'STANDING_HISTORY_MISSING', value: 0 }),
      ]),
    );
  });

  it('uses stale TrustScore numbers while pending score history stays neutral', () => {
    const scored = baseInput();
    const stale = structuredClone(scored);
    stale.trustScores.client = {
      ...stale.trustScores.client,
      status: 'stale',
      outcomesSince: 1,
    };
    const pending = structuredClone(scored);
    pending.trustScores.client = { status: 'pending-score', outcomeCount: 3 };
    const neutral = structuredClone(scored);
    neutral.trustScores.client.score = 50;

    expect(assessRisk(stale).score).toBe(assessRisk(scored).score);
    expect(assessRisk(pending).score).toBe(assessRisk(neutral).score);
    expect(assessRisk(pending).confidence).toBeLessThan(assessRisk(scored).confidence);
  });

  it('hashes safe structured TrustScore evidence as deterministic input', () => {
    const withoutEvidence = baseInput();
    const withEvidence = structuredClone(withoutEvidence);
    withEvidence.trustScores.client.signals = [
      { name: 'on-time-rate', direction: 'favorable', strength: 'STRENGTH_STRONG' },
    ];

    expect(createRiskInputVersion(withEvidence)).not.toBe(createRiskInputVersion(withoutEvidence));
    expect(
      assessRisk(withEvidence).signals.find((item) => item.name === 'PARTY_STANDING_STRONG')
        .evidence,
    ).toContain('on-time-rate');
  });

  it('includes safe TrustScore evidence in the explanation for mid-band standing', () => {
    const input = baseInput();
    input.trustScores.client.score = 60;
    input.trustScores.freelancer.score = 60;
    input.trustScores.client.signals = [
      { name: 'repeat-engagement-rate', direction: 'favorable', strength: 'STRENGTH_MEDIUM' },
    ];

    expect(assessRisk(input).explanation).toContain('repeat-engagement-rate');
  });

  it('makes milestone-total mismatch riskier than aligned milestones', () => {
    const aligned = baseInput();
    aligned.proposal.payModel = 'milestone';
    aligned.proposal.proposedMilestones = [
      { description: 'Design', amount: 500 },
      { description: 'Build', amount: 650 },
    ];
    const mismatched = structuredClone(aligned);
    mismatched.proposal.proposedMilestones[1].amount = 50;

    expect(assessRisk(mismatched).score).toBeGreaterThan(assessRisk(aligned).score);
  });

  it('hashes canonical inputs deterministically and changes when an input changes', () => {
    const input = baseInput();
    const reordered = {
      trustScores: input.trustScores,
      proposal: input.proposal,
      jobPost: input.jobPost,
    };
    expect(createRiskInputVersion(input)).toBe(createRiskInputVersion(reordered));
    expect(createRiskInputVersion(input)).toMatch(/^sha256:[0-9a-f]{64}$/);

    const changed = structuredClone(input);
    changed.proposal.bid += 1;
    expect(createRiskInputVersion(changed)).not.toBe(createRiskInputVersion(input));
  });

  it('returns exactly the same assessment for exactly the same input', () => {
    expect(assessRisk(baseInput())).toEqual(assessRisk(baseInput()));
  });
});
