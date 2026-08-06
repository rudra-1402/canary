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
    displayName: { type: String, required: true, maxlength: 120 },
    headline: { type: String, maxlength: 160 },
    bio: { type: String, maxlength: 2000 },
    businessName: { type: String, maxlength: 160 },
    paymentVerified: { type: Boolean, default: false },
    verificationStatus: { type: String, enum: ['none', 'id-verified'], default: 'none' },
    onboardingCompletedAt: { type: Date, default: null },
    skills: {
      type: [{ type: String, maxlength: 80 }],
      validate: { validator: (v) => v.length <= 15, message: 'skills may not exceed 15 entries' },
    },
    hourlyRate: { type: Number, min: 0, max: 10000 },
    portfolio: {
      type: [{ type: String, maxlength: 500 }],
      validate: {
        validator: (v) => v.length <= 10,
        message: 'portfolio may not exceed 10 entries',
      },
    },
    workHistory: {
      type: [{ type: String, maxlength: 500 }],
      validate: {
        validator: (v) => v.length <= 20,
        message: 'workHistory may not exceed 20 entries',
      },
    },
    certifications: {
      type: [{ type: String, maxlength: 250 }],
      validate: {
        validator: (v) => v.length <= 10,
        message: 'certifications may not exceed 10 entries',
      },
    },
    languages: {
      type: [{ type: String, maxlength: 120 }],
      validate: {
        validator: (v) => v.length <= 10,
        message: 'languages may not exceed 10 entries',
      },
    },
    availableForWork: Boolean,
    country: { type: String, maxlength: 100 },
    taxRatePct: Number,
    industry: { type: String, maxlength: 120 },
    typicalBudget: { type: Number, min: 0, max: 1000000000 },
    paymentTermsNorm: { type: String, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

profileSchema.index({ identityId: 1, role: 1 }, { unique: true });
profileSchema.index({ role: 1, discoverable: 1, availableForWork: 1, hourlyRate: 1 });
profileSchema.index({ role: 1, discoverable: 1, availableForWork: 1, displayName: 1 });
profileSchema.index({ skills: 1 });

export default model('Profile', profileSchema);
