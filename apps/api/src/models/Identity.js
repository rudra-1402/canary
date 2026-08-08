import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const identitySchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String },
    authProviderId: { type: String }, // Google `sub`; absent for local-only accounts
    passwordHash: { type: String }, // bcrypt; absent for social-only accounts
    emailVerified: { type: Boolean, default: false },
    activeProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', default: null }, // set in Phase 3
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default model('Identity', identitySchema);
