import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const savedItemSchema = new Schema(
  {
    ownerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    // No `refPath` here (contrast with RiskSignal.parentId) — 'job'/'profile' are not
    // Mongoose model names, so `.populate()` needs an app-level lookup table
    // ({ job: 'JobPost', profile: 'Profile' }), not a broken refPath: 'targetType'.
    targetType: { type: String, enum: ['job', 'profile'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('SavedItem', savedItemSchema);
