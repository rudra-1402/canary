import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const jobPostSchema = new Schema(
  {
    clientProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true, maxlength: 5000 },
    skills: { type: [String], default: [] },
    jobType: { type: String, enum: ['hourly', 'fixed'], required: true },
    budgetOrRate: { type: Number, required: true },
    experienceLevel: { type: String, enum: ['entry', 'intermediate', 'expert'], required: true },
    projectLength: {
      type: String,
      enum: ['less-than-1-month', '1-to-3-months', '3-to-6-months', 'more-than-6-months'],
      required: true,
    },
    hoursPerWeek: Number,
    screeningQuestions: { type: [String], default: [] },
    status: { type: String, enum: ['draft', 'open', 'closed'], default: 'draft' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default model('JobPost', jobPostSchema);
