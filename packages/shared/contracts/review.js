import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex ObjectId');

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
