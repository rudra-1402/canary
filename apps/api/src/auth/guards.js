import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { getCurrentUser } from './getCurrentUser.js';

// Gate: require an authenticated session. Errors flow to the central errorMiddleware.
export function requireAuth(req, res, next) {
  if (!req.user) return next(new UnauthorizedError());
  next();
}

// Gate on the active profile's role. Phase 1 has no Profiles, so this always 403s until
// Phase 3 wires activeProfile — exported now so route authors have the seam.
export function requireRole(role) {
  return (req, res, next) => {
    const user = getCurrentUser(req);
    if (!user) return next(new UnauthorizedError());
    if (!user.activeProfile || user.activeProfile.role !== role) {
      return next(new ForbiddenError(`Requires an active ${role} profile`));
    }
    next();
  };
}
