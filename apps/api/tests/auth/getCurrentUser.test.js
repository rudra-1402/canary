import { describe, it, expect } from 'vitest';
import { getCurrentUser } from '../../src/auth/getCurrentUser.js';

describe('getCurrentUser', () => {
  it('returns null when unauthenticated', () => {
    expect(getCurrentUser({ user: undefined })).toBeNull();
  });
  it('maps req.user including emailVerified and the attached active profile', () => {
    const req = {
      user: {
        _id: { toString: () => 'a'.repeat(24) },
        email: 'a@b.com',
        emailVerified: true,
        _activeProfile: { _id: { toString: () => 'b'.repeat(24) }, role: 'freelancer' },
      },
    };
    expect(getCurrentUser(req)).toEqual({
      identityId: 'a'.repeat(24),
      email: 'a@b.com',
      emailVerified: true,
      activeProfile: { id: 'b'.repeat(24), role: 'freelancer' },
    });
  });

  it('activeProfile is null when none is attached', () => {
    const req = {
      user: { _id: { toString: () => 'a'.repeat(24) }, email: 'a@b.com', emailVerified: false },
    };
    expect(getCurrentUser(req).activeProfile).toBeNull();
  });
});
