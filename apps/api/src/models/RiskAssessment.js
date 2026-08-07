import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const riskAssessmentSchema = new Schema(
  {
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', required: true },
    score: { type: Number, min: 0, max: 100, required: true },
    level: { type: String, enum: ['low', 'med', 'high'], required: true },
    verdict: { type: String, enum: ['proceed', 'caution', 'avoid'], required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    explanation: { type: String, maxlength: 5000 },
    inputVersion: { type: String, required: true, maxlength: 200 },
    modelVersion: { type: String, required: true, maxlength: 100 },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

riskAssessmentSchema.index({ engagementId: 1, inputVersion: 1 }, { unique: true });
riskAssessmentSchema.index({ engagementId: 1, generatedAt: -1, _id: -1 });

export default model('RiskAssessment', riskAssessmentSchema);
