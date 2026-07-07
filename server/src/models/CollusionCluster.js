import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const collusionClusterSchema = new Schema({
  memberProfileIds: {
    type: [{ type: Schema.Types.ObjectId, ref: 'Profile' }],
    validate: { validator: (v) => v.length >= 2, message: 'a ring needs at least 2 members' },
  },
  edgeEvidence: { type: String, required: true },
  severity: { type: Number, min: 0, max: 1, required: true },
  detectedAt: { type: Date, default: Date.now },
});

export default model('CollusionCluster', collusionClusterSchema);
