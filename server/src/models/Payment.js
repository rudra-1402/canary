import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const paymentSchema = new Schema(
  {
    freelancerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', default: null },
    amount: { type: Number, required: true },
    receivedAt: { type: Date, required: true },
    importSource: { type: String, enum: ['manual', 'csv', 'stripe-test'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('Payment', paymentSchema);
