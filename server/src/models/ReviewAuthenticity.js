import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const reviewAuthenticitySchema = new Schema({
  reviewId: { type: Schema.Types.ObjectId, ref: 'Review', required: true, unique: true },
  status: { type: String, enum: ['authentic', 'suspected-collusion'], required: true },
  collusionScore: { type: Number, min: 0, max: 1, required: true },
  rationale: String,
  detectedAt: { type: Date, default: Date.now },
  collusionClusterId: { type: Schema.Types.ObjectId, ref: 'CollusionCluster', default: null },
});

export default model('ReviewAuthenticity', reviewAuthenticitySchema);
