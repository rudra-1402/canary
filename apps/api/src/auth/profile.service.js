import Identity from '../models/Identity.js';
import Profile from '../models/Profile.js';
import { BadRequestError, ForbiddenError } from '../lib/errors.js';

// Create a role-scoped Profile for an Identity (ADR-0008: <=1 per role). The first Profile
// becomes the active one. Throws if the role already exists for this Identity.
export async function createProfileForIdentity(identityId, { role, displayName }) {
  const existing = await Profile.findOne({ identityId, role });
  if (existing) throw new BadRequestError(`A ${role} profile already exists`);
  const profile = await Profile.create({
    identityId,
    role,
    displayName,
    origin: 'user-registered',
  });
  const identity = await Identity.findById(identityId);
  if (identity && !identity.activeProfileId) {
    identity.activeProfileId = profile._id;
    await identity.save();
  }
  return profile;
}

// Set the identity's active profile to one it owns. ForbiddenError if the profile isn't theirs.
export async function switchActiveProfile(identityId, profileId) {
  const profile = await Profile.findById(profileId);
  if (!profile || String(profile.identityId) !== String(identityId)) {
    throw new ForbiddenError('Not your profile');
  }
  await Identity.updateOne({ _id: identityId }, { $set: { activeProfileId: profileId } });
}

export async function listIdentityProfiles(identityId) {
  return Profile.find({ identityId });
}
