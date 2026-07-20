import { ZodError } from 'zod';
import { AppError } from './errors.js';

// Central error handler — registered LAST in app.js. This is the status-code
// mapping every route inherits. Express 5 forwards thrown/rejected async
// errors from handlers here automatically (no asyncHandler wrapper needed).
// The 4-arg signature is required for Express to treat this as error middleware.
// eslint-disable-next-line no-unused-vars
export function errorMiddleware(err, req, res, next) {
  // Response shapes are intentionally distinct per error type — don't collapse them.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'ValidationError',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.name, message: err.message });
  }
  // Third-party middleware (e.g. csrf-sync) throws http-errors — a 4xx statusCode but not
  // an AppError. Surface those by status; everything else stays a generic 500.
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return res
      .status(err.statusCode)
      .json({ error: err.name || 'ClientError', message: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'InternalServerError' });
}
