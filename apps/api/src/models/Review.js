import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const reviewSchema = new Schema(
  {
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', required: true },
    authorProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      validate: {
        validator(value) {
          return (
            value == null || this.subjectProfileId == null || !value.equals(this.subjectProfileId)
          );
        },
        message: 'authorProfileId and subjectProfileId must differ',
      },
    },
    subjectProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    text: { type: String, maxlength: 5000 },
    visibleAt: { type: Date, default: null },
    isPlantedCollusion: { type: Boolean, default: false },
    isPlantedSabotage: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

reviewSchema.index({ engagementId: 1, authorProfileId: 1 }, { unique: true });

export default model('Review', reviewSchema);
