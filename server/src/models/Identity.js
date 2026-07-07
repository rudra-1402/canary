import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const identitySchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String },
    authProviderId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model('Identity', identitySchema);
