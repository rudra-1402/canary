import { describe, it, expect } from 'vitest';
import { describeHealth } from '../src/lib/health.js';

describe('describeHealth', () => {
  it('accepts a payload matching the shared HealthResponseSchema', () => {
    const result = describeHealth({ status: 'ok', timestamp: new Date().toISOString() });
    expect(result).toBe('API is healthy.');
  });

  it('rejects a payload that violates the shared HealthResponseSchema', () => {
    expect(() => describeHealth({ status: 'not-ok', timestamp: 'not-a-date' })).toThrow();
  });
});
