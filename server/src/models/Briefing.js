import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const briefingSchema = new Schema(
  {
    engagementId: {
      type: Schema.Types.ObjectId,
      ref: 'Engagement',
      required: function () {
        return !this.subjectProfileId;
      },
    },
    subjectProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', default: null },
    verdict: { type: String, enum: ['proceed', 'caution', 'avoid'], required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    citations: { type: [{ type: Schema.Types.Mixed }], default: [] },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

briefingSchema.index({ engagementId: 1 });
briefingSchema.index({ subjectProfileId: 1 }, { sparse: true });

export default model('Briefing', briefingSchema);
