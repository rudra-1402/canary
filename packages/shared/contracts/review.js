import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');

export const ProfileReviewListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ReviewSchema = z
  .object({
    engagementId: objectId,
    authorProfileId: objectId,
    subjectProfileId: objectId,
    rating: z.number().min(1).max(5),
    text: z.string().max(5000).optional(),
    visibleAt: z.date().nullable().default(null),
    isPlantedCollusion: z.boolean().default(false),
    isPlantedSabotage: z.boolean().default(false),
  })
  .superRefine((review, ctx) => {
    if (review.authorProfileId === review.subjectProfileId) {
      ctx.addIssue({
        code: 'custom',
        path: ['authorProfileId'],
        message: 'authorProfileId and subjectProfileId must differ',
      });
    }
  });

// Public review projection. Evaluation-only planted provenance must never cross this boundary.
export const PublicReviewSchema = z
  .object({
    id: objectId,
    engagementId: objectId,
    authorProfileId: objectId,
    subjectProfileId: objectId,
    rating: z.number().min(1).max(5),
    text: z.string().optional(),
    visibleAt: z.string().datetime(),
    createdAt: z.string().datetime().nullable(),
  })
  .strict();

export const ProfileReviewListResponseSchema = z
  .object({
    data: z.array(PublicReviewSchema),
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .strict();
