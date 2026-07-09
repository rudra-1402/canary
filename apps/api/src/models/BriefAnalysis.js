import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const flagsSchema = new Schema(
  {
    vagueness: { type: Boolean, default: false },
    exposureForPayLanguage: { type: Boolean, default: false },
    urgencyPressure: { type: Boolean, default: false },
    missingTerms: { type: Boolean, default: false },
  },
  { _id: false }
);

const briefAnalysisSchema = new Schema(
  {
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', required: true, unique: true },
    flags: { type: flagsSchema, required: true },
    rationale: { type: String, maxlength: 5000 },
    sourceSnippets: { type: [String], default: [] },
    modelMetadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('BriefAnalysis', briefAnalysisSchema);
