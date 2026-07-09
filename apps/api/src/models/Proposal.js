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
    coverLetter: { type: String, maxlength: 5000 },
    screeningAnswers: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn'],
      default: 'submitted',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default model('Proposal', proposalSchema);
