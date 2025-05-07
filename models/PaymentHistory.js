const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema({
  applicantID: {
    type: String,
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
  },
  paymentMethod: {
    type: String,
    enum: ['link', 'card', 'gcash'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'PHP',
  },
  status: {
    type: String,
    enum: ['pending', 'successful', 'failed', 'expired'],
    default: 'pending',
  },
  referenceNumber: {
    type: String,
    required: true,
    unique: true,
  },
  checkoutId: {
    type: String,
    required: true,
    unique: true,
  },
  paymentId: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
  },
});

// Update updatedAt on save
paymentHistorySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PaymentHistory', paymentHistorySchema);