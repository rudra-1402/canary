import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const trustScoreSchema = new Schema(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    score: { type: Number, min: 0, max: 100, required: true },
    level: { type: String, enum: ['low', 'med', 'high'], required: true },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

trustScoreSchema.index({ profileId: 1, generatedAt: -1 });

export default model('TrustScore', trustScoreSchema);
