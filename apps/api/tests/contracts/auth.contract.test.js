import { describe, it, expect } from 'vitest';
import { RegisterRequestSchema, LoginRequestSchema, MeResponseSchema } from '@canary/shared';

describe('auth contracts', () => {
  it('register requires a valid email and an 8+ char password', () => {
    expect(() =>
      RegisterRequestSchema.parse({ email: 'a@b.com', password: 'longenough1' }),
    ).not.toThrow();
    expect(() => RegisterRequestSchema.parse({ email: 'bad', password: 'longenough1' })).toThrow();
    expect(() => RegisterRequestSchema.parse({ email: 'a@b.com', password: 'short' })).toThrow();
  });
  it('login requires email + password', () => {
    expect(() => LoginRequestSchema.parse({ email: 'a@b.com', password: 'x' })).not.toThrow();
  });
  it('me response allows a null active profile', () => {
    expect(
      MeResponseSchema.parse({ identityId: 'a'.repeat(24), email: 'a@b.com', activeProfile: null }),
    ).toBeDefined();
  });
});
