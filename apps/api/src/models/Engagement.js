import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const agreedTermsSchema = new Schema(
  {
    scope: { type: String, required: true },
    price: { type: Number, required: true },
    paymentTerms: { type: String, required: true },
    timeline: { type: String, required: true },
  },
  { _id: false }
);

const engagementSchema = new Schema(
  {
    freelancerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    clientProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    jobPostId: { type: Schema.Types.ObjectId, ref: 'JobPost', default: null },
    proposalId: { type: Schema.Types.ObjectId, ref: 'Proposal', default: null },
    status: { type: String, enum: ['prospective', 'active', 'concluded'], required: true },
    agreedTerms: {
      type: agreedTermsSchema,
      required: function () {
        return this.status !== 'prospective';
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('Engagement', engagementSchema);
