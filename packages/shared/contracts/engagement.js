import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');
const status = z.enum(['prospective', 'active', 'concluded']);

const AgreedTermsSchema = z.object({
  scope: z.string(),
  price: z.number(),
  paymentTerms: z.string(),
  timeline: z.string(),
  dueAt: z.date().optional(),
  revisionsIncluded: z.number().int().min(0).default(0),
});

const ResponseAgreedTermsSchema = z
  .object({
    scope: z.string(),
    price: z.number(),
    paymentTerms: z.string(),
    timeline: z.string(),
    dueAt: z.string().datetime().optional(),
    revisionsIncluded: z.number().int().min(0),
  })
  .strict();

export const EngagementSchema = z
  .object({
    freelancerProfileId: objectId,
    clientProfileId: objectId,
    jobPostId: objectId.nullable(),
    proposalId: objectId.nullable(),
    status,
    agreedTerms: AgreedTermsSchema.optional(),
  })
  .superRefine((engagement, ctx) => {
    if (engagement.status === 'prospective') return;

    if (!engagement.agreedTerms) {
      ctx.addIssue({ code: 'custom', path: ['agreedTerms'], message: 'agreedTerms is required' });
      return;
    }

    if (!engagement.agreedTerms.dueAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['agreedTerms', 'dueAt'],
        message: 'dueAt is required',
      });
    }
  });

export const MyEngagementSchema = z
  .object({
    id: objectId,
    counterpartyProfileId: objectId,
    jobPostId: objectId.nullable(),
    proposalId: objectId.nullable(),
    status,
    agreedTerms: ResponseAgreedTermsSchema.nullable(),
    createdAt: z.string().datetime().nullable(),
  })
  .superRefine((engagement, ctx) => {
    if (engagement.status === 'prospective') return;
    if (!engagement.agreedTerms?.dueAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['agreedTerms', 'dueAt'],
        message: 'agreedTerms with dueAt is required',
      });
    }
  });

export const MyEngagementsResponseSchema = z.object({ data: z.array(MyEngagementSchema) }).strict();
