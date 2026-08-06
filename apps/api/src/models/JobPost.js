import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const jobPostSchema = new Schema(
  {
    clientProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    title: { type: String, required: true, maxlength: 160 },
    category: { type: String, required: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 5000 },
    skills: {
      type: [{ type: String, maxlength: 80 }],
      default: [],
      validate: { validator: (value) => value.length <= 15, message: 'skills may not exceed 15' },
    },
    jobType: { type: String, enum: ['hourly', 'fixed'], required: true },
    budgetOrRate: { type: Number, required: true, min: Number.MIN_VALUE, max: 1_000_000_000 },
    experienceLevel: { type: String, enum: ['entry', 'intermediate', 'expert'], required: true },
    projectLength: {
      type: String,
      enum: ['less-than-1-month', '1-to-3-months', '3-to-6-months', 'more-than-6-months'],
      required: true,
    },
    hoursPerWeek: {
      type: Number,
      min: 1,
      max: 168,
      validate: { validator: Number.isInteger, message: 'hoursPerWeek must be an integer' },
    },
    screeningQuestions: {
      type: [{ type: String, maxlength: 500 }],
      default: [],
      validate: {
        validator: (value) => value.length <= 10,
        message: 'screeningQuestions may not exceed 10',
      },
    },
    status: { type: String, enum: ['draft', 'open', 'closed'], default: 'draft' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

jobPostSchema.index({ clientProfileId: 1, status: 1, createdAt: -1 });

export default model('JobPost', jobPostSchema);
