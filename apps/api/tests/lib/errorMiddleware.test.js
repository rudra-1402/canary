import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { errorMiddleware } from '../../src/lib/errorMiddleware.js';
import { NotFoundError } from '../../src/lib/errors.js';

function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('errorMiddleware', () => {
  it('maps a ZodError to 400 ValidationError', () => {
    let zodErr;
    try {
      z.object({ page: z.number() }).parse({ page: 'nope' });
    } catch (e) {
      zodErr = e;
    }
    const res = mockRes();
    errorMiddleware(zodErr, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('ValidationError');
  });

  it('maps a NotFoundError to its statusCode', () => {
    const res = mockRes();
    errorMiddleware(new NotFoundError('JobPost', 'abc'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0]).toMatchObject({ error: 'NotFoundError' });
  });

  it('maps a non-AppError carrying a 4xx statusCode (e.g. csrf http-error) to that status', () => {
    const res = mockRes();
    const httpErr = Object.assign(new Error('invalid csrf token'), {
      statusCode: 403,
      name: 'ForbiddenError',
    });
    errorMiddleware(httpErr, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toBe('ForbiddenError');
  });

  it('maps an unknown error to 500 InternalServerError', () => {
    const res = mockRes();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorMiddleware(new Error('boom'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'InternalServerError' });
    spy.mockRestore();
  });
});
