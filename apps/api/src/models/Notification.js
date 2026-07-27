import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const notificationSchema = new Schema(
  {
    recipientProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    type: {
      type: String,
      enum: ['proposal', 'review', 'outcome-due', 'low-risk-match'],
      required: true,
    },
    targetRef: { type: Schema.Types.Mixed, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default model('Notification', notificationSchema);
