import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// Required when scored, forbidden otherwise. The forbidding half is the point: an
// insufficient-history row carrying a number on the 0-100 scale is indistinguishable
// from a real score, which is how ~90% of profiles came to look confidently scored.
function requiredWhenScored() {
  return this.status === 'scored';
}

const absentUnlessScored = {
  validator(value) {
    return this.status === 'scored' || value === undefined || value === null;
  },
  message: (props) => `${props.path} must not be set unless status is "scored"`,
};

const trustScoreSchema = new Schema(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    // No default: a row that never stated its status is an error, not silently "scored".
    status: { type: String, enum: ['scored', 'insufficient-history'], required: true },
    score: {
      type: Number,
      min: 0,
      max: 100,
      required: requiredWhenScored,
      validate: absentUnlessScored,
    },
    level: {
      type: String,
      enum: ['low', 'med', 'high'],
      required: requiredWhenScored,
      validate: absentUnlessScored,
    },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

trustScoreSchema.index({ profileId: 1, generatedAt: -1 });

export default model('TrustScore', trustScoreSchema);
