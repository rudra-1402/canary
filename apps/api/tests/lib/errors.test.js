import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../../src/lib/errors.js';

describe('errors', () => {
  it('NotFoundError carries a 404 status, its name, and a descriptive message', () => {
    const err = new NotFoundError('JobPost', 'abc');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('JobPost abc not found');
  });

  it('UnauthorizedError is 401', () => {
    expect(new UnauthorizedError('nope').statusCode).toBe(401);
    expect(new UnauthorizedError('nope').name).toBe('UnauthorizedError');
  });
  it('ForbiddenError is 403', () => {
    expect(new ForbiddenError('nope').statusCode).toBe(403);
  });
});
