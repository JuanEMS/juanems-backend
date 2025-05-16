const mongoose = require('mongoose');

const pendingOTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  otpExpiry: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['signup', 'signin'],
    default: 'signup'
  },
  attempts: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Document will be automatically deleted after 10 minutes
  }
});

// Add index for faster queries
pendingOTPSchema.index({ email: 1, otp: 1 });
pendingOTPSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

const PendingOTP = mongoose.model('PendingOTP', pendingOTPSchema);

module.exports = PendingOTP;
