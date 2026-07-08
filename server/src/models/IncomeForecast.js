import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const incomeForecastSchema = new Schema({
  freelancerProfileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
  period: { type: String, required: true },
  projectedAmount: { type: Number, required: true },
  confidenceRange: {
    low: { type: Number },
    high: { type: Number },
  },
  generatedAt: { type: Date, default: Date.now },
});

export default model('IncomeForecast', incomeForecastSchema);
