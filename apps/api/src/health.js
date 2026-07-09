import { HealthResponseSchema } from '@canary/shared';

export function getHealthStatus() {
  return HealthResponseSchema.parse({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
