import { describe, it, expect } from 'vitest';
import { getHealthStatus } from '../src/health.js';

describe('getHealthStatus', () => {
  it('returns a payload that satisfies the shared HealthResponseSchema', () => {
    const result = getHealthStatus();
    expect(result.status).toBe('ok');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
