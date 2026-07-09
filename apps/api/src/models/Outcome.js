import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const outcomeSchema = new Schema(
  {
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', required: true, unique: true },
    paidInFull: { type: Boolean, required: true },
    daysLate: { type: Number, default: null },
    scopeCreepOccurred: { type: Boolean, default: false },
    ghosted: { type: Boolean, default: false },
    endedAs: { type: String, enum: ['completed', 'cancelled', 'ghosted'], required: true },
    labelSource: { type: String, enum: ['synthetic', 'heuristic', 'self-reported'], required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('Outcome', outcomeSchema);
