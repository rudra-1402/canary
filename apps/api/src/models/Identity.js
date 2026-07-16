import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const identitySchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String },
    // External IdP subject id (e.g. Google `sub`). Optional: local-only accounts have none.
    authProviderId: { type: String },
    // bcrypt hash for local email/password accounts. Optional: social-only accounts have none.
    passwordHash: { type: String },
    emailVerified: { type: Boolean, default: false },
    // Server-authoritative active profile (set once Profiles exist — Phase 3).
    activeProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default model('Identity', identitySchema);
