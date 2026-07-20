import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requireRole } from '../../src/auth/guards.js';
import { UnauthorizedError, ForbiddenError } from '../../src/lib/errors.js';

describe('requireAuth', () => {
  it('calls next() with no error when a user is present', () => {
    const next = vi.fn();
    requireAuth({ user: { _id: '1' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
  it('calls next(UnauthorizedError) when unauthenticated', () => {
    const next = vi.fn();
    requireAuth({ user: undefined }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });
});

describe('requireRole', () => {
  const withProfile = (role) => ({
    user: {
      _id: { toString: () => 'x' },
      email: 'a@b',
      _activeProfile: { _id: { toString: () => 'p' }, role },
    },
  });
  it('passes when the active profile matches the role', () => {
    const next = vi.fn();
    requireRole('freelancer')(withProfile('freelancer'), {}, next);
    expect(next).toHaveBeenCalledWith();
  });
  it('403s when the active profile role differs', () => {
    const next = vi.fn();
    requireRole('client')(withProfile('freelancer'), {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError);
  });
});
