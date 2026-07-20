import rateLimit from 'express-rate-limit';

// Throttle auth endpoints against brute-force / abuse.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
