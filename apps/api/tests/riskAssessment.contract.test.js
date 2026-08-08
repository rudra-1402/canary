import { describe, expect, it } from 'vitest';
import {
  AcceptProposalRequestSchema,
  DeclineProposalRequestSchema,
  EngagementDetailResponseSchema,
  ProposalDecisionResponseSchema,
  ProposalDeclineResponseSchema,
  RequestRiskAssessmentSchema,
  RequestRiskPreviewSchema,
  RiskAssessmentCommandResponseSchema,
  RiskAssessmentResponseSchema,
  RiskAssessmentSummarySchema,
  RiskPreviewResponseSchema,
} from '@canary/shared';

const id = 'a'.repeat(24);
const otherId = 'b'.repeat(24);
const generatedAt = '2026-08-06T12:00:00.000Z';

const riskAssessment = {
  id,
  engagementId: otherId,
  status: 'current',
  score: 31,
  level: 'low',
  verdict: 'proceed',
  confidence: 0.81,
  explanation: 'The proposed terms are clear and both Parties have usable standing.',
  signals: [
    {
      code: 'CLEAR_SCOPE',
      severity: 'positive',
      label: 'Scope is specific',
      evidence: 'The JobPost includes a detailed description and named skills.',
    },
  ],
  generatedAt,
  inputVersion: 'sha256:input',
  modelVersion: 'risk-deterministic-v1',
};

const engagement = {
  id: otherId,
  status: 'prospective',
  freelancerProfileId: id,
  clientProfileId: otherId,
  jobPostId: id,
  proposalId: otherId,
  agreedTerms: {
    scope: 'Build the approved dashboard.',
    price: 1200,
    paymentTerms: 'project',
    timeline: '14 days',
    dueAt: null,
    revisionsIncluded: 0,
  },
  createdAt: generatedAt,
  acceptedAt: null,
};

describe('RiskAssessment and Proposal-decision contracts', () => {
  it('accepts the canonical risk summary and rejects internal signal fields', () => {
    expect(RiskAssessmentSummarySchema.parse(riskAssessment)).toEqual(riskAssessment);
    expect(RiskAssessmentSummarySchema.parse({ ...riskAssessment, status: 'stale' }).status).toBe(
      'stale',
    );
    expect(() =>
      RiskAssessmentSummarySchema.parse({
        ...riskAssessment,
        signals: [{ ...riskAssessment.signals[0], value: 0.4 }],
      }),
    ).toThrow();
  });

  it('limits assessment requests to the recompute command', () => {
    expect(RequestRiskAssessmentSchema.parse({})).toEqual({ recompute: false });
    expect(RequestRiskAssessmentSchema.parse({ recompute: true })).toEqual({ recompute: true });
    expect(() => RequestRiskAssessmentSchema.parse({ recompute: true, confirm: true })).toThrow();
  });

  it('limits preview requests to the recompute command', () => {
    expect(RequestRiskPreviewSchema.parse({})).toEqual({ recompute: false });
    expect(RequestRiskPreviewSchema.parse({ recompute: true })).toEqual({ recompute: true });
  });

  it('parses a preview envelope with a prospective-only Engagement (no proposal/agreedTerms)', () => {
    const previewEngagement = {
      id: otherId,
      status: 'prospective',
      freelancerProfileId: id,
      clientProfileId: otherId,
      jobPostId: id,
      createdAt: generatedAt,
    };
    expect(() =>
      RiskPreviewResponseSchema.parse({
        data: { engagement: previewEngagement, riskAssessment },
      }),
    ).not.toThrow();
    expect(() =>
      RiskPreviewResponseSchema.parse({
        data: { engagement: { ...previewEngagement, status: 'active' }, riskAssessment },
      }),
    ).toThrow();
  });

  it('requires literal confirmation for acceptance', () => {
    expect(AcceptProposalRequestSchema.parse({ confirm: true })).toEqual({ confirm: true });
    expect(() => AcceptProposalRequestSchema.parse({})).toThrow();
    expect(() => AcceptProposalRequestSchema.parse({ confirm: false })).toThrow();
  });

  it('accepts a bounded private reason code for decline', () => {
    expect(DeclineProposalRequestSchema.parse({ reasonCode: 'terms-not-aligned' })).toEqual({
      reasonCode: 'terms-not-aligned',
    });
    expect(() => DeclineProposalRequestSchema.parse({ reasonCode: 'x'.repeat(101) })).toThrow();
  });

  it('parses command and private-read envelopes without leaking Mongoose fields', () => {
    expect(() =>
      RiskAssessmentCommandResponseSchema.parse({
        data: { engagement, riskAssessment },
      }),
    ).not.toThrow();
    expect(() => RiskAssessmentResponseSchema.parse({ data: { riskAssessment } })).not.toThrow();
    expect(() =>
      EngagementDetailResponseSchema.parse({
        data: {
          engagement: {
            ...engagement,
            jobPost: { id, title: 'Dashboard build' },
            proposal: { id: otherId, status: 'submitted', bid: 1200 },
            parties: {
              freelancer: {
                id,
                role: 'freelancer',
                displayName: 'Mina',
                paymentVerified: false,
                verificationStatus: 'none',
                skills: ['React'],
                portfolio: [],
                workHistory: [],
                certifications: [],
                languages: [],
                createdAt: generatedAt,
              },
              client: {
                id: otherId,
                role: 'client',
                displayName: 'Aster Labs',
                paymentVerified: true,
                verificationStatus: 'id-verified',
                skills: [],
                portfolio: [],
                workHistory: [],
                certifications: [],
                languages: [],
                createdAt: generatedAt,
              },
            },
            trustByParty: {
              freelancer: { status: 'pending-score', profileId: id, outcomeCount: 2 },
              client: {
                status: 'insufficient-history',
                profileId: otherId,
                outcomeCount: 0,
                outcomesNeeded: 3,
              },
            },
            proposedTerms: {
              ...engagement.agreedTerms,
              jobPostBudgetOrRate: 1500,
              jobType: 'fixed',
              skills: ['React'],
              projectLength: 'less-than-1-month',
              hoursPerWeek: null,
              proposedDurationDays: 14,
              proposedMilestones: [{ description: 'Delivery', amount: 1200 }],
              screeningQuestions: ['How will you test it?'],
              screeningAnswers: ['With contract tests.'],
            },
            agreedTerms: null,
            riskAssessment,
            outcomeEligibility: false,
            allowedActions: ['request-risk-assessment'],
            concludedAt: null,
            timeline: [{ event: 'prospective-created', at: generatedAt }],
          },
        },
      }),
    ).not.toThrow();
  });

  it('requires the complete accepted decision response', () => {
    expect(() =>
      ProposalDecisionResponseSchema.parse({
        data: {
          proposal: { id, status: 'accepted' },
          engagement: {
            ...engagement,
            status: 'active',
            agreedTerms: { ...engagement.agreedTerms, dueAt: '2026-08-20T12:00:00.000Z' },
            acceptedAt: generatedAt,
          },
          riskAssessment,
        },
      }),
    ).not.toThrow();

    expect(() =>
      ProposalDecisionResponseSchema.parse({
        data: {
          proposal: { id, status: 'declined' },
          engagement: {
            ...engagement,
            status: 'active',
            agreedTerms: { ...engagement.agreedTerms, dueAt: '2026-08-20T12:00:00.000Z' },
            acceptedAt: generatedAt,
          },
          riskAssessment,
        },
      }),
    ).toThrow();

    expect(
      ProposalDeclineResponseSchema.parse({
        data: { proposal: { id, status: 'declined' } },
      }).data.proposal.status,
    ).toBe('declined');
    expect(() =>
      ProposalDeclineResponseSchema.parse({
        data: { proposal: { id, status: 'accepted' } },
      }),
    ).toThrow();
  });
});
