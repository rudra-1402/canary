import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const riskSignalSchema = new Schema(
  {
    parentType: { type: String, enum: ['TrustScore', 'RiskAssessment'], required: true },
    parentId: { type: Schema.Types.ObjectId, required: true, refPath: 'parentType' },
    name: { type: String, required: true },
    label: { type: String, maxlength: 160 },
    evidence: { type: String, maxlength: 1000 },
    value: { type: Number, required: true },
    direction: { type: String, enum: ['favorable', 'unfavorable'], required: true },
    source: { type: String, enum: ['structured-data', 'brief-analysis'], required: true },
    sourceBriefAnalysisId: { type: Schema.Types.ObjectId, ref: 'BriefAnalysis', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

riskSignalSchema.index({ parentType: 1, parentId: 1 });

export default model('RiskSignal', riskSignalSchema);
