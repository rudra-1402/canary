// The one auth door — downstream calls this, never Passport/session internals, so swapping
// provider or session strategy touches only here. activeProfile stays null until Phase 3.
export function getCurrentUser(req) {
  const identity = req.user;
  if (!identity) return null;
  return {
    identityId: identity._id.toString(),
    email: identity.email,
    emailVerified: Boolean(identity.emailVerified),
    activeProfile: null,
  };
}
