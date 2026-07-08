import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const taxReserveSchema = new Schema(
  {
    incomeForecastId: { type: Schema.Types.ObjectId, ref: 'IncomeForecast', required: true, unique: true },
    suggestedAmount: { type: Number, required: true },
    taxRateAssumption: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('TaxReserve', taxReserveSchema);
