import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const briefingFeedbackSchema = new Schema(
  {
    briefingId: { type: Schema.Types.ObjectId, ref: 'Briefing', required: true },
    raterProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    vote: { type: String, enum: ['up', 'down'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('BriefingFeedback', briefingFeedbackSchema);
