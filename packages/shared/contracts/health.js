import { z } from 'zod';

// GET /api/health -> this shape. The first real contract, seeded to prove the
// pattern (same schema imported by apps/web and apps/api, per working-agreement
// Rule 2 — "different types becomes structurally impossible") before any real
// feature endpoint exists.
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
});
