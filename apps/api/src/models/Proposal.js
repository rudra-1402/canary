import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const milestoneSchema = new Schema(
  { description: { type: String, required: true }, amount: { type: Number, required: true } },
  { _id: false },
);

const proposalSchema = new Schema(
  {
    jobPostId: { type: Schema.Types.ObjectId, ref: 'JobPost', required: true },
    freelancerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    bid: { type: Number, required: true },
    payModel: { type: String, enum: ['project', 'milestone'], required: true },
    proposedMilestones: { type: [milestoneSchema], default: [] },
    durationEstimate: String,
    proposedDurationDays: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'proposedDurationDays must be an integer' },
    },
    coverLetter: { type: String, maxlength: 5000 },
    screeningAnswers: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn'],
      default: 'submitted',
    },
    declineReasonCode: { type: String, maxlength: 100, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The database is the concurrent-submit guard. The dense-data preflight recorded no
// existing duplicate pairs before this index was introduced.
proposalSchema.index({ jobPostId: 1, freelancerProfileId: 1 }, { unique: true });
proposalSchema.index({ jobPostId: 1, status: 1, createdAt: -1 });

export default model('Proposal', proposalSchema);
