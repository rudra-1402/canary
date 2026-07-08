import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const savedSearchSchema = new Schema(
  {
    ownerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    query: { type: Schema.Types.Mixed, default: {} },
    facets: { type: Schema.Types.Mixed, default: {} },
    name: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('SavedSearch', savedSearchSchema);
