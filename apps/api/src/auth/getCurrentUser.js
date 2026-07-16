// The one auth door. Everything downstream calls this, never Passport/session internals,
// so swapping provider or session strategy touches only this file.
// Phase 1: activeProfile is always null (Profiles land in Phase 3, which will resolve
// req.user.activeProfileId into { id, role } here).
export function getCurrentUser(req) {
  const identity = req.user;
  if (!identity) return null;
  return {
    identityId: identity._id.toString(),
    email: identity.email,
    activeProfile: null,
  };
}
