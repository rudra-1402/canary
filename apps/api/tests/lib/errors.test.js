import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError } from '../../src/lib/errors.js';

describe('errors', () => {
  it('NotFoundError carries a 404 status, its name, and a descriptive message', () => {
    const err = new NotFoundError('JobPost', 'abc');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('NotFoundError');
    expect(err.message).toBe('JobPost abc not found');
  });
});
