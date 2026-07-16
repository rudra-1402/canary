import { csrfSync } from 'csrf-sync';

// Synchroniser-token CSRF (the session-based pattern). Clients fetch the token from
// GET /api/auth/csrf-token and send it in the x-csrf-token header on mutations.
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

export { csrfSynchronisedProtection, generateToken };
