import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const profileSchema = new Schema(
  {
    identityId: { type: Schema.Types.ObjectId, ref: 'Identity', required: true },
    role: { type: String, enum: ['freelancer', 'client'], required: true },
    origin: { type: String, enum: ['user-registered', 'synthetic-seeded'], required: true },
    discoverable: {
      type: Boolean,
      default: function () {
        return this.origin === 'synthetic-seeded';
      },
    },
    displayName: { type: String, required: true },
    businessName: { type: String },
    paymentVerified: { type: Boolean, default: false },
    verificationStatus: { type: String, enum: ['none', 'id-verified'], default: 'none' },
    onboardingCompletedAt: { type: Date, default: null },
    skills: {
      type: [String],
      validate: { validator: (v) => v.length <= 15, message: 'skills may not exceed 15 entries' },
    },
    hourlyRate: Number,
    portfolio: [String],
    workHistory: [String],
    certifications: [String],
    languages: [String],
    availableForWork: Boolean,
    country: String,
    taxRatePct: Number,
    industry: String,
    typicalBudget: Number,
    paymentTermsNorm: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

profileSchema.index({ identityId: 1, role: 1 }, { unique: true });

export default model('Profile', profileSchema);
