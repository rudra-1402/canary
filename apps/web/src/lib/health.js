import { HealthResponseSchema } from '@canary/shared';

// Validates a /api/health response against the same contract apps/api produces
// it with — the "different types becomes structurally impossible" guarantee.
export function describeHealth(rawResponse) {
  HealthResponseSchema.parse(rawResponse);
  return 'API is healthy.';
}
