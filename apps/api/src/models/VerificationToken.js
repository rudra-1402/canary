import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Hashed (never raw), single-use, expiring token for email verification / password reset.
const verificationTokenSchema = new Schema(
  {
    identityId: { type: Schema.Types.ObjectId, ref: 'Identity', required: true },
    type: { type: String, enum: ['email-verification', 'password-reset'], required: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL: Mongo drops the row once expiresAt passes.
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model('VerificationToken', verificationTokenSchema);
