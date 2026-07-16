import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../../src/auth/guards.js';
import { UnauthorizedError } from '../../src/lib/errors.js';

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
