import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');

export const RiskAssessmentSignalSchema = z
  .object({
    code: z.string().min(1).max(80).regex(/^[A-Z0-9_]+$/),
    severity: z.enum(['positive', 'warning']),
    label: z.string().min(1).max(160),
    evidence: z.string().min(1).max(1000),
  })
  .strict();

export const RiskAssessmentSummarySchema = z
  .object({
    id: objectId,
    engagementId: objectId,
    score: z.number().min(0).max(100),
    level: z.enum(['low', 'med', 'high']),
    verdict: z.enum(['proceed', 'caution', 'avoid']),
    confidence: z.number().min(0).max(1),
    explanation: z.string().max(5000),
    signals: z.array(RiskAssessmentSignalSchema),
    generatedAt: z.string().datetime(),
    inputVersion: z.string().min(1).max(200),
    modelVersion: z.string().min(1).max(100),
  })
  .strict();

export const RequestRiskAssessmentSchema = z
  .object({ recompute: z.boolean().default(false) })
  .strict();

export const ProposalRiskAssessmentParamSchema = z
  .object({ proposalId: objectId })
  .strict();

export const EngagementRiskAssessmentParamSchema = z
  .object({ engagementId: objectId })
  .strict();

export const RiskAssessmentResponseSchema = z
  .object({ data: z.object({ riskAssessment: RiskAssessmentSummarySchema }).strict() })
  .strict();
