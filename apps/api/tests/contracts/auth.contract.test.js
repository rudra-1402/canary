import { describe, it, expect } from 'vitest';
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  ResendVerificationRequestSchema,
  MeResponseSchema,
  CreateProfileRequestSchema,
  SwitchProfileRequestSchema,
} from '@canary/shared';

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
      MeResponseSchema.parse({
        identityId: 'a'.repeat(24),
        email: 'a@b.com',
        emailVerified: true,
        activeProfile: null,
      }),
    ).toBeDefined();
  });
});

describe('phase 2 auth contracts', () => {
  it('forgot/resend require a valid email', () => {
    expect(() => ForgotPasswordRequestSchema.parse({ email: 'a@b.com' })).not.toThrow();
    expect(() => ResendVerificationRequestSchema.parse({ email: 'bad' })).toThrow();
  });
  it('reset requires a token and an 8+ char password', () => {
    expect(() =>
      ResetPasswordRequestSchema.parse({ token: 't', password: 'longenough1' }),
    ).not.toThrow();
    expect(() => ResetPasswordRequestSchema.parse({ token: 't', password: 'short' })).toThrow();
  });
  it('me response now includes emailVerified', () => {
    expect(() =>
      MeResponseSchema.parse({
        identityId: 'a'.repeat(24),
        email: 'a@b.com',
        emailVerified: false,
        activeProfile: null,
      }),
    ).not.toThrow();
  });
});

describe('phase 3 profile contracts', () => {
  it('create-profile requires a role and displayName', () => {
    expect(() =>
      CreateProfileRequestSchema.parse({ role: 'freelancer', displayName: 'Jo' }),
    ).not.toThrow();
    expect(() => CreateProfileRequestSchema.parse({ role: 'nope', displayName: 'Jo' })).toThrow();
    expect(() => CreateProfileRequestSchema.parse({ role: 'client' })).toThrow();
  });
  it('switch-profile requires a 24-hex profileId', () => {
    expect(() => SwitchProfileRequestSchema.parse({ profileId: 'a'.repeat(24) })).not.toThrow();
    expect(() => SwitchProfileRequestSchema.parse({ profileId: 'bad' })).toThrow();
  });
});
