// The one auth door. deserializeUser attaches the resolved active Profile as _activeProfile,
// so this stays sync.
export function getCurrentUser(req) {
  const identity = req.user;
  if (!identity) return null;
  const p = identity._activeProfile;
  return {
    identityId: identity._id.toString(),
    email: identity.email,
    emailVerified: Boolean(identity.emailVerified),
    activeProfile: p ? { id: p._id.toString(), role: p.role } : null,
  };
}
