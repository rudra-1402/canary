import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const riskAssessmentSchema = new Schema(
  {
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', required: true },
    score: { type: Number, min: 0, max: 100, required: true },
    level: { type: String, enum: ['low', 'med', 'high'], required: true },
    verdict: { type: String, enum: ['proceed', 'caution', 'avoid'], required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    explanation: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

riskAssessmentSchema.index({ engagementId: 1 });

export default model('RiskAssessment', riskAssessmentSchema);
