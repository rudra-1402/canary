import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const savedItemSchema = new Schema(
  {
    ownerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    targetType: { type: String, enum: ['job', 'profile'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('SavedItem', savedItemSchema);
