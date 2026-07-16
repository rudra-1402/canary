import { csrfSync } from 'csrf-sync';

// Synchroniser-token CSRF (correct for session-based apps). The secret lives in the
// session; clients read the token from GET /api/auth/csrf-token and send it back in
// the x-csrf-token header on mutations.
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

export { csrfSynchronisedProtection, generateToken };
