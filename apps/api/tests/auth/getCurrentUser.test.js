import { describe, it, expect } from 'vitest';
import { getCurrentUser } from '../../src/auth/getCurrentUser.js';

describe('getCurrentUser', () => {
  it('returns null when unauthenticated', () => {
    expect(getCurrentUser({ user: undefined })).toBeNull();
  });
  it('maps req.user to the contract shape (activeProfile null in phase 1)', () => {
    const req = {
      user: { _id: { toString: () => 'a'.repeat(24) }, email: 'a@b.com', activeProfileId: null },
    };
    expect(getCurrentUser(req)).toEqual({
      identityId: 'a'.repeat(24),
      email: 'a@b.com',
      activeProfile: null,
    });
  });
});
