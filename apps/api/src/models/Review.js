import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const reviewSchema = new Schema(
  {
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', required: true },
    authorProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    subjectProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    text: { type: String, maxlength: 5000 },
    visibleAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default model('Review', reviewSchema);
