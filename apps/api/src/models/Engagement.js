import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const proposedMilestoneSchema = new Schema(
  { description: { type: String, required: true }, amount: { type: Number, required: true } },
  { _id: false },
);

const agreedTermsSchema = new Schema(
  {
    scope: { type: String, required: true },
    price: { type: Number, required: true },
    paymentTerms: { type: String, required: true },
    timeline: { type: String, required: true },
    dueAt: {
      type: Date,
      required: function () {
        const engagement = this.parent?.();
        return Boolean(engagement && engagement.status !== 'prospective');
      },
    },
    revisionsIncluded: {
      type: Number,
      min: 0,
      default: 0,
      validate: { validator: Number.isInteger, message: 'revisionsIncluded must be an integer' },
    },
    jobPostBudgetOrRate: { type: Number, min: Number.MIN_VALUE },
    jobType: { type: String, enum: ['hourly', 'fixed'] },
    skills: { type: [String], default: undefined },
    projectLength: {
      type: String,
      enum: ['less-than-1-month', '1-to-3-months', '3-to-6-months', 'more-than-6-months'],
    },
    hoursPerWeek: { type: Number, min: 1, max: 168, default: null },
    proposedDurationDays: {
      type: Number,
      min: 1,
      validate: { validator: Number.isInteger, message: 'proposedDurationDays must be an integer' },
    },
    proposedMilestones: { type: [proposedMilestoneSchema], default: undefined },
    screeningQuestions: { type: [String], default: undefined },
    screeningAnswers: { type: [String], default: undefined },
  },
  { _id: false },
);

const engagementSchema = new Schema(
  {
    freelancerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    clientProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    jobPostId: { type: Schema.Types.ObjectId, ref: 'JobPost', default: null },
    proposalId: { type: Schema.Types.ObjectId, ref: 'Proposal', default: null },
    status: { type: String, enum: ['prospective', 'active', 'concluded'], required: true },
    acceptedAt: { type: Date, default: null },
    concludedAt: { type: Date, default: null },
    agreedTerms: {
      type: agreedTermsSchema,
      required: function () {
        return this.status !== 'prospective';
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

engagementSchema.index({ status: 1, freelancerProfileId: 1 });
engagementSchema.index(
  { proposalId: 1 },
  {
    unique: true,
    partialFilterExpression: { proposalId: { $type: 'objectId' } },
  },
);

export default model('Engagement', engagementSchema);
