import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const outcomeSchema = new Schema(
  {
    engagementId: { type: Schema.Types.ObjectId, ref: 'Engagement', required: true },
    subjectProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    counterpartyProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    subjectRole: { type: String, enum: ['freelancer', 'client'], required: true },
    observed: { type: Boolean, required: true },
    deliveredAt: {
      type: Date,
      validate: {
        validator(value) {
          return (
            (this.subjectRole === 'freelancer' && this.observed && !this.ghosted) || value == null
          );
        },
        message: 'deliveredAt must be null for client or unobserved Outcomes',
      },
    },
    daysLate: {
      type: Number,
      validate: {
        validator(value) {
          return (
            (this.subjectRole === 'freelancer' && this.observed && !this.ghosted) || value == null
          );
        },
        message: 'daysLate must be null for client or unobserved Outcomes',
      },
    },
    paidInFull: {
      type: Boolean,
      validate: {
        validator(value) {
          return (this.subjectRole === 'client' && this.observed && !this.ghosted) || value == null;
        },
        message: 'paidInFull must be null for freelancer or unobserved Outcomes',
      },
    },
    revisionsRequested: {
      type: Number,
      validate: {
        validator(value) {
          return (this.subjectRole === 'client' && this.observed && !this.ghosted) || value == null;
        },
        message: 'revisionsRequested must be null for freelancer or unobserved Outcomes',
      },
    },
    scopeCreepOccurred: {
      type: Boolean,
      validate: {
        validator(value) {
          return (this.subjectRole === 'client' && this.observed && !this.ghosted) || value == null;
        },
        message: 'scopeCreepOccurred must be null for freelancer or unobserved Outcomes',
      },
    },
    ghosted: { type: Boolean, default: false },
    endedAs: { type: String, enum: ['completed', 'cancelled', 'ghosted'], required: true },
    labelSource: {
      type: String,
      enum: ['synthetic', 'heuristic', 'self-reported', 'counterparty-reported'],
      required: true,
    },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

outcomeSchema.index({ engagementId: 1, subjectProfileId: 1 }, { unique: true });

export default model('Outcome', outcomeSchema);
