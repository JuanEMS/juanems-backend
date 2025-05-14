const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema({
  applicantID: { type: String, required: true },
  email: { type: String, required: true, trim: true },
  applicantName: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  referenceNumber: { type: String, required: true, unique: true },
  checkoutId: { type: String, required: true, unique: true },
  paymentId: { type: String },
  status: {
    type: String,
    enum: ['pending', 'successful', 'failed', 'cancelled', 'expired'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

module.exports = mongoose.model('PaymentHistory', paymentHistorySchema);