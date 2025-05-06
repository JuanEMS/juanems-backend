const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AccountsSchema = new mongoose.Schema({
  userID: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  middleName: { type: String },
  lastName: { type: String, required: true },
  dob: { type: Date }, // optional: user may set it on their own 
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true, unique: true },
  nationality: { type: String }, // Optional: user may set it on their own
  studentID: { type: String }, // Optional: only for students
  password: { type: String, required: true },
  temporaryPassword: { type: String, select: false },
  role: { type: String, required: true },
  hasCustomAccess: {
    type: Boolean,
    default: false
  },
  customModules: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Pending Verification'],
    default: 'Pending Verification',
  },
  // New OTP related fields
  otp: { type: String },
  otpExpires: { type: Date },
  otpAttempts: {
    type: Number,
    default: 0
  },
  otpAttemptLockout: {
    type: Date
  },
  lastOtpAttempt: {
    type: Date
  },
  passwordResetOtp: { type: String },
  passwordResetOtpExpires: { type: Date },
  lastPasswordReset: { type: Date },
  verificationExpires: {
    type: Date,
    default: () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days from now
  },
  // New fields for user activity tracking
  loginAttempts: {
    type: Number,
    default: 0
  },
  activityStatus: {
    type: String,
    enum: ['Online', 'Offline'],
    default: 'Offline'
  },
  lastLogin: {
    type: Date
  },
  lastLogout: {
    type: Date
  },
  isArchived: {
    type: Boolean,
    default: false
  }  
}, { timestamps: true });

// Hash password before save
AccountsSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified and is not already hashed
  if (!this.isModified('password') || this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
    return next();
  }

  try {
    // Trim and clean the password before hashing
    const cleanPassword = this.password.trim();
    console.log('Original password before hash:', cleanPassword); // Debug log
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(cleanPassword, salt);
    console.log('Hashed password:', this.password); // Debug log
    next();
  } catch (err) {
    console.error('Error hashing password:', err);
    next(err);
  }
});

// Method to check if OTP is valid
AccountsSchema.methods.isOtpValid = function() {
  return this.otp && this.otpExpires && this.otpExpires > Date.now();
};

// Add this to your EnrolleeApplicant model file, before the module.exports
AccountsSchema.methods.getPlainPassword = async function() {
  // We need to fetch the document again with the temporaryPassword selected
  const user = await this.model('Accounts')
    .findById(this._id)
    .select('+temporaryPassword')
    .exec();
  return user.temporaryPassword;
};

module.exports = mongoose.model('Accounts', AccountsSchema);

